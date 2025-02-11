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

export class TerminalInstance {
  private xterm: XTerm | null = null;
  private fitAddon: FitAddon | null = null;
  private ptyId: string | null = null;
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unlistenOutput: (() => void) | null = null;

  constructor(
    private readonly config: Config,
    private readonly onFocus?: () => void
  ) {}

  async mount(container: HTMLElement): Promise<void> {
    if (this.xterm) return;
    this.container = container;
    container.className = "terminal-container";

    // Set padding CSS variables from config
    const padding = this.config.terminal?.padding ?? { x: 12, y: 8 };
    container.style.setProperty("--terminal-padding-x", `${padding.x}px`);
    container.style.setProperty("--terminal-padding-y", `${padding.y}px`);

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

    // Create PTY
    const cwd = await homeDir();
    this.ptyId = await invoke<string>("create_pty", {
      cwd,
      rows: this.xterm.rows,
      cols: this.xterm.cols,
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
  }

  private handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.focus();
    this.onFocus?.();
  };

  focus(): void {
    this.xterm?.focus();
  }

  fit(): void {
    if (!this.fitAddon || !this.xterm || !this.ptyId) return;

    this.fitAddon.fit();
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
}
