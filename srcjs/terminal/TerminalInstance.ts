import {
  Terminal as XTerm,
  ITerminalOptions,
  ITerminalInitOnlyOptions,
} from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { homeDir } from "@tauri-apps/api/path";
import type { Config } from "../config";
import { EventBus } from "../utils/EventBus";

export class TerminalInstance {
  private xterm: XTerm | null = null;
  private fitAddon: FitAddon | null = null;
  private ptyId: string | null = null;
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unlistenOutput: (() => void) | null = null;
  private lastScrollPosition = 0;
  private visible = false;
  private focused: boolean = false;

  constructor(
    private readonly config: Config,
    private readonly onFocus?: () => void
  ) {}

  async mount(
    container: HTMLElement,
    command?: string,
    args?: string[]
  ): Promise<void> {
    if (this.xterm) return;
    this.container = container;
    container.className = "terminal-container";

    // Set theme CSS variables
    document.documentElement.style.setProperty(
      "--terminal-bg",
      this.config.theme.background
    );
    document.documentElement.style.setProperty(
      "--terminal-fg",
      this.config.theme.foreground
    );
    document.documentElement.style.setProperty(
      "--terminal-header",
      this.config.window.titlebar_background
    );

    // Interactive elements theme
    document.documentElement.style.setProperty(
      "--interactive-bg",
      this.config.window.interactive.background_color
    );
    document.documentElement.style.setProperty(
      "--interactive-fg",
      this.config.window.interactive.text_color
    );
    document.documentElement.style.setProperty(
      "--interactive-border",
      this.config.window.interactive.border_color
    );
    document.documentElement.style.setProperty(
      "--interactive-hover-bg",
      this.config.window.interactive.hover_background
    );

    // Add tab-specific theme variables
    document.documentElement.style.setProperty(
      "--tab-active-bg",
      this.config.window.tabs.active.background_color
    );
    document.documentElement.style.setProperty(
      "--tab-active-text",
      this.config.window.tabs.active.text_color
    );
    document.documentElement.style.setProperty(
      "--tab-inactive-bg",
      this.config.window.tabs.inactive.background_color
    );
    document.documentElement.style.setProperty(
      "--tab-inactive-text",
      this.config.window.tabs.inactive.text_color
    );
    document.documentElement.style.setProperty(
      "--accent-color",
      this.config.theme.blue ?? "#61afef"
    );

    // Set padding CSS variables from config
    const padding = this.config.terminal?.padding ?? { x: 12, y: 8 };
    container.style.setProperty("--terminal-padding-x", `${padding.x}px`);
    container.style.setProperty("--terminal-padding-y", `${padding.y}px`);

    // Set titlebar height
    document.documentElement.style.setProperty(
      "--titlebar-height",
      `${this.config.window.titlebar_height}px`
    );

    const terminalOptions: ITerminalOptions & ITerminalInitOnlyOptions = {
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: this.config.font.size ?? 14,
      fontFamily:
        this.config.font.family !== "monospace"
          ? `${this.config.font.family}, ${this.config.font.fallback_family}`
          : "monospace",
      lineHeight: this.config.font.line_height ?? 1.2,
      theme: {
        background: this.config.theme.background ?? "#1a1b26",
        foreground: this.config.theme.foreground ?? "#a9b1d6",
        cursor: this.config.theme.cursor ?? "#c0caf5",
      },
      allowProposedApi: true,
      convertEol: true,
      scrollback: this.config.terminal?.scrollback ?? 5000,
      rows: 40, // Initial size
      cols: 100,
    };

    this.xterm = new XTerm(terminalOptions);

    // Add addons
    this.fitAddon = new FitAddon();
    this.xterm.loadAddon(this.fitAddon);
    this.xterm.loadAddon(new WebLinksAddon());

    // Open terminal in container
    this.xterm.open(container);

    // Try WebGL addon
    try {
      this.xterm.loadAddon(new WebglAddon());
    } catch (e) {
      console.warn("WebGL addon failed to load:", e);
    }

    // Ensure container is visible and sized before fitting
    await new Promise((resolve) => setTimeout(resolve, 0));
    this.fit();

    // Create PTY with optional command and args
    const cwd = await homeDir();
    console.log(cwd);
    console.log(command);
    console.log(args);
    this.ptyId = await invoke<string>("create_pty", {
      cwd,
      rows: this.xterm.rows,
      cols: this.xterm.cols,
      command,
      args,
    });

    // Set up event listeners
    this.unlistenOutput = (await getCurrentWindow().listen(
      `pty://output/${this.ptyId}`,
      (event: any) => {
        this.xterm?.write(event.payload);
      }
    )) as unknown as () => void;

    this.xterm.onData((data) => {
      if (this.ptyId) {
        invoke("write_pty", {
          ptyId: this.ptyId,
          data,
        }).catch(console.error);
      }
    });

    // Handle container clicks for focus
    container.addEventListener("click", this.handleClick);

    // Set up resize observer
    this.resizeObserver = new ResizeObserver(() => {
      // Debounce resize events
      setTimeout(() => this.fit(), 0);
    });
    this.resizeObserver.observe(container);

    // Initial focus
    this.focus();

    // Track visibility changes
    this.visible = true;
    this.fit(); // Initial fit

    this.setupFocusTracking();
  }

  private handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.focus();
    this.onFocus?.();
  };

  focus(): void {
    if (this.xterm) {
      this.focused = true;
      this.lastScrollPosition = this.xterm.buffer.active.viewportY;
      this.xterm.focus();
    }
  }

  fit(): void {
    if (!this.fitAddon || !this.xterm || !this.ptyId) return;

    // Store current viewport position
    const buffer = this.xterm.buffer.active;
    const currentLine = buffer.baseY + buffer.viewportY;
    const isAtBottom = currentLine + this.xterm.rows >= buffer.length;

    this.fitAddon.fit();

    // After fit, restore position or stay at bottom
    requestAnimationFrame(() => {
      if (isAtBottom) {
        this.xterm?.scrollToBottom();
      } else {
        // Try to maintain relative position
        this.xterm?.scrollToLine(currentLine);
      }
      this.xterm?.refresh(0, this.xterm.rows - 1);
    });

    invoke("resize_pty", {
      ptyId: this.ptyId,
      rows: this.xterm.rows,
      cols: this.xterm.cols,
    }).catch(console.error);
  }

  async destroy(): Promise<void> {
    // Clean up event listeners
    this.container?.removeEventListener("click", this.handleClick);
    this.resizeObserver?.disconnect();
    this.unlistenOutput?.();

    // Destroy PTY
    if (this.ptyId) {
      await invoke("destroy_pty", { ptyId: this.ptyId });
      this.ptyId = null;
    }

    // Dispose xterm
    if (this.xterm) {
      this.xterm.dispose();
      this.xterm = null;
    }

    this.container = null;
  }

  isFocused(): boolean {
    return this.focused;
  }

  private setupFocusTracking(): void {
    if (this.container) {
      this.container.addEventListener("focusin", () => {
        this.focused = true;
        EventBus.getInstance().emit("terminalFocus", this);
      });

      this.container.addEventListener("focusout", (e) => {
        // Only lose focus if the new focus is outside the terminal
        if (!this.container?.contains(e.relatedTarget as Node)) {
          this.focused = false;
        }
      });
    }
  }
}
