import {
  Terminal as XTerm,
  ITerminalOptions,
  ITerminalInitOnlyOptions,
} from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import type { Config } from "../config";
import { EventBus } from "../utils/EventBus";
import { Channel } from "@tauri-apps/api/core";

// Define the PTY output event types to match the Rust backend
type PtyOutputEvent =
  | {
      event: "output";
      data: string;
    }
  | {
      event: "exit";
      data: {
        status: string;
      };
    };

export class TerminalInstance {
  private xterm: XTerm | null = null;
  private fitAddon: FitAddon | null = null;
  private ptyId: string | null = null;
  private tabId: string | null = null;
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private outputChannel: Channel<PtyOutputEvent> | null = null;
  private focused: boolean = false;
  private isBeingDestroyed: boolean = false;

  constructor(
    private readonly config: Config,
    tabId: string,
    private readonly onFocus?: () => void
  ) {
    this.tabId = tabId;
  }

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
    console.log("Creating PTY with:", { cwd, command, args });

    // Create a channel for PTY output and exit events
    this.outputChannel = new Channel<PtyOutputEvent>();

    // Set up channel message handler
    this.outputChannel.onmessage = async (message: PtyOutputEvent) => {
      if (this.isBeingDestroyed) return;

      if (message.event === "output") {
        this.xterm?.write(message.data);
      } else if (message.event === "exit") {
        console.log(
          `Terminal process exited with status: ${JSON.stringify(
            message.data.status
          )}`
        );

        // Avoid duplicate exit events
        if (!this.isBeingDestroyed && this.ptyId) {
          this.isBeingDestroyed = true;

          try {
            // Clean up resources immediately to prevent memory leaks
            await this.cleanupResources();

            // Emit an event that the tab manager can listen to
            // This should trigger the tab to be closed
            EventBus.getInstance().emit(EventBus.TERMINAL_EXIT, this.ptyId);

            console.log(`Exit event emitted for terminal ${this.ptyId}`);
          } catch (error) {
            console.error("Error handling terminal exit:", error);
          }
        }
      }
    };

    this.ptyId = await invoke<string>("create_pty", {
      cwd,
      rows: this.xterm.rows,
      cols: this.xterm.cols,
      command,
      args,
      outputChannel: this.outputChannel,
    });

    console.log(
      `Terminal created with ptyId=${this.ptyId}, tabId=${this.tabId}`
    );

    // Set the terminal ID and tab ID as data attributes on the container for debugging
    container.dataset.ptyId = this.ptyId || "";
    container.dataset.tabId = this.tabId || "";

    // Set up event listeners
    this.xterm.onData((data) => {
      if (this.ptyId && !this.isBeingDestroyed) {
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
      this.xterm.focus();
    }
  }

  fit(): void {
    if (!this.fitAddon || !this.xterm || !this.ptyId || this.isBeingDestroyed)
      return;

    try {
      // Store current viewport position
      const buffer = this.xterm.buffer.active;
      const currentLine = buffer.baseY + buffer.viewportY;
      const isAtBottom = currentLine + this.xterm.rows >= buffer.length;

      // Perform the fit operation
      this.fitAddon.fit();

      // Get the new dimensions
      const newRows = this.xterm.rows;
      const newCols = this.xterm.cols;

      // After fit, restore position or stay at bottom
      requestAnimationFrame(() => {
        try {
          if (isAtBottom && this.xterm) {
            this.xterm.scrollToBottom();
          } else if (this.xterm) {
            // Try to maintain relative position
            this.xterm.scrollToLine(currentLine);
          }
          this.xterm?.refresh(0, this.xterm.rows - 1);
        } catch (error) {
          console.error("Error restoring terminal position after fit:", error);
        }
      });

      // Resize the PTY
      invoke("resize_pty", {
        ptyId: this.ptyId,
        rows: newRows,
        cols: newCols,
      }).catch((error) => {
        console.error("Error resizing PTY:", error);
      });
    } catch (error) {
      console.error("Error during terminal fit operation:", error);
    }
  }

  async destroy(): Promise<void> {
    console.log(`Destroying terminal instance with ptyId=${this.ptyId}`);

    // Prevent multiple destroy calls
    if (this.isBeingDestroyed) {
      console.log("Terminal is already being destroyed, skipping");
      return;
    }

    // Mark as being destroyed to prevent further operations
    this.isBeingDestroyed = true;

    // Clean up resources
    await this.cleanupResources();

    // Destroy PTY
    if (this.ptyId) {
      try {
        console.log(`Invoking destroy_pty for ${this.ptyId}`);
        await invoke("destroy_pty", { ptyId: this.ptyId });
        console.log(`Successfully destroyed PTY ${this.ptyId}`);
      } catch (error) {
        console.error("Error destroying PTY:", error);
      } finally {
        // Always clear the ptyId to prevent further operations
        this.ptyId = null;
      }
    }

    // Remove container reference
    this.container = null;

    console.log("Terminal instance destruction complete");
  }

  isFocused(): boolean {
    return this.focused;
  }

  private setupFocusTracking(): void {
    if (!this.xterm) return;

    // Use the correct event handling for xterm.js
    this.xterm.element?.addEventListener("focus", () => {
      this.focused = true;
      EventBus.getInstance().emit("terminalFocus");
    });

    this.xterm.element?.addEventListener("blur", () => {
      this.focused = false;
    });
  }

  // Add a method to clean up resources without destroying the PTY
  private async cleanupResources(): Promise<void> {
    console.log(`Cleaning up resources for terminal with ptyId=${this.ptyId}`);

    // Clean up event listeners
    if (this.container) {
      this.container.removeEventListener("click", this.handleClick);
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Clean up channel
    if (this.outputChannel) {
      // Properly dispose of the channel
      this.outputChannel = null;
    }

    // Dispose xterm in a try-catch to handle potential errors
    try {
      if (this.xterm) {
        console.log("Disposing xterm instance");
        this.xterm.dispose();
        this.xterm = null;
      }
    } catch (error) {
      console.error("Error disposing xterm:", error);
    }

    // Clear container
    if (this.container) {
      try {
        console.log("Clearing container");
        this.container.innerHTML = "";
      } catch (error) {
        console.error("Error clearing container:", error);
      }
    }

    this.focused = false;
    console.log("Terminal resources cleanup complete");
  }

  // Get the terminal ID
  getPtyId(): string | null {
    return this.ptyId;
  }

  // Get the tab ID
  getTabId(): string | null {
    return this.tabId;
  }
}
