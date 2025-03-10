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
import { Channel } from "@tauri-apps/api/core";
import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";

// Define the PTY output event types to match the Rust backend
type PtyOutputEvent =
  | {
      event: "output";
      data: number[];
    }
  | {
      event: "exit";
      data: {
        status: string;
      };
    }
  | {
      event: "metrics";
      data: {
        bytes_read: number;
        bytes_written: number;
        messages_sent: number;
        uptime_ms: number;
      };
    }
  | {
      event: "bell";
    }
  | {
      event: "title";
      data: {
        title: string;
      };
    };

// Define metrics type
interface PtyMetrics {
  bytesRead: number;
  bytesWritten: number;
  messagesSent: number;
  uptimeMs: number;
  throughputBps: number;
}

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
  private metrics: PtyMetrics | null = null;
  private lastMetricsUpdate: number = 0;
  private bellEnabled: boolean = true;
  private currentTitle: string = "";

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
    args?: string[],
    options?: {
      bufferSize?: number;
      batchTimeoutMs?: number;
      metricsIntervalMs?: number;
      bellEnabled?: boolean;
    }
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
      allowTransparency: true,
      rightClickSelectsWord: true,
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
        // Convert byte array to Uint8Array and write to terminal
        const uint8Array = new Uint8Array(message.data);
        this.xterm?.write(uint8Array);
      } else if (message.event === "exit") {
        console.log(
          `Terminal process exited with status: ${JSON.stringify(
            message.data.status
          )}`
        );

        // Handle exit event logic
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
      } else if (message.event === "metrics") {
        // Update metrics
        const now = Date.now();
        const timeDiff = now - this.lastMetricsUpdate;

        // Calculate throughput if we have previous metrics
        let throughputBps = 0;
        if (this.metrics && timeDiff > 0) {
          const bytesDiff = message.data.bytes_read - this.metrics.bytesRead;
          throughputBps = (bytesDiff / timeDiff) * 1000; // Bytes per second
        }

        this.metrics = {
          bytesRead: message.data.bytes_read,
          bytesWritten: message.data.bytes_written,
          messagesSent: message.data.messages_sent,
          uptimeMs: message.data.uptime_ms,
          throughputBps,
        };

        this.lastMetricsUpdate = now;

        // Emit metrics event for anyone interested
        EventBus.getInstance().emit("terminal:metrics", {
          ptyId: this.ptyId,
          metrics: this.metrics,
        });
      } else if (message.event === "bell") {
        // Handle bell event
        if (this.bellEnabled) {
          // Play bell sound if available
          try {
            // Try to use the system bell
            if (
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              // Use a silent notification as a visual bell
              new Notification("Terminal Bell", {
                body: "A terminal process is requesting your attention",
                silent: true,
              });
            } else {
              // Fallback to a simple beep sound
              const audio = new Audio(
                "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU..."
              ); // Base64 encoded short beep sound
              audio.volume = 0.5;
              audio
                .play()
                .catch((e) => console.error("Failed to play bell sound:", e));
            }
          } catch (error) {
            console.error("Error playing bell sound:", error);
          }

          // Emit bell event for anyone interested
          EventBus.getInstance().emit("terminal:bell", {
            ptyId: this.ptyId,
          });
        }
      } else if (message.event === "title") {
        // Update the terminal title
        this.currentTitle = message.data.title;

        // Emit title event for anyone interested
        EventBus.getInstance().emit("terminal:title", {
          ptyId: this.ptyId,
          title: this.currentTitle,
        });
      }
    };

    this.ptyId = await invoke<string>("create_pty", {
      cwd,
      rows: this.xterm.rows,
      cols: this.xterm.cols,
      command,
      args,
      outputChannel: this.outputChannel,
      buffer_size: options?.bufferSize || 32768, // Default to 32KB for better performance
      batch_timeout_ms: options?.batchTimeoutMs || 10, // Default to 10ms batch timeout
      metrics_interval_ms: options?.metricsIntervalMs || 1000, // Default to 1 second metrics interval
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

    // Set bell enabled from options or default to true
    this.bellEnabled =
      options?.bellEnabled !== undefined ? options.bellEnabled : true;

    // Add clipboard event handlers
    this.xterm.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Handle copy (Ctrl+C or Cmd+C when text is selected)
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "c" &&
        this.xterm?.hasSelection()
      ) {
        const selection = this.xterm.getSelection();
        // Use Tauri's clipboard plugin
        writeText(selection).catch((err: Error) => {
          console.error("Failed to copy to clipboard:", err);
        });
        return false; // Prevent default handling
      }

      // Handle paste (Ctrl+V or Cmd+V)
      if ((event.ctrlKey || event.metaKey) && event.key === "v") {
        // Use Tauri's clipboard plugin
        readText()
          .then((text: string) => {
            if (text && this.ptyId && !this.isBeingDestroyed) {
              invoke("write_pty", {
                ptyId: this.ptyId,
                data: text,
              }).catch(console.error);
            }
          })
          .catch((err: Error) => {
            console.error("Failed to read from clipboard:", err);
          });
        return false; // Prevent default handling
      }

      return true; // Allow other key events
    });

    // Add context menu for copy/paste
    container.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();

      // Create a simple context menu
      const menu = document.createElement("div");
      menu.className = "terminal-context-menu";
      menu.style.position = "absolute";
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;
      menu.style.backgroundColor = this.config.theme.background || "#1a1b26";
      menu.style.color = this.config.theme.foreground || "#a9b1d6";
      menu.style.border = "1px solid #30374b";
      menu.style.borderRadius = "4px";
      menu.style.padding = "4px 0";
      menu.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.2)";
      menu.style.zIndex = "1000";

      // Add menu items
      const addMenuItem = (text: string, action: () => void) => {
        const item = document.createElement("div");
        item.textContent = text;
        item.style.padding = "6px 12px";
        item.style.cursor = "pointer";
        item.style.fontSize = "14px";

        item.addEventListener("mouseenter", () => {
          item.style.backgroundColor = this.config.theme.selection || "#28324e";
        });

        item.addEventListener("mouseleave", () => {
          item.style.backgroundColor = "transparent";
        });

        item.addEventListener("click", () => {
          action();
          document.body.removeChild(menu);
        });

        menu.appendChild(item);
      };

      // Copy menu item
      addMenuItem("Copy", () => {
        const selection = this.xterm?.getSelection();
        if (selection) {
          // Use Tauri's clipboard plugin
          writeText(selection).catch((err: Error) => {
            console.error("Failed to copy to clipboard:", err);
          });
        }
      });

      // Paste menu item
      addMenuItem("Paste", () => {
        // Use Tauri's clipboard plugin
        readText()
          .then((text: string) => {
            if (text && this.ptyId && !this.isBeingDestroyed) {
              invoke("write_pty", {
                ptyId: this.ptyId,
                data: text,
              }).catch(console.error);
            }
          })
          .catch((err: Error) => {
            console.error("Failed to read from clipboard:", err);
          });
      });

      // Add the menu to the document
      document.body.appendChild(menu);

      // Remove the menu when clicking outside
      const removeMenu = (e: MouseEvent) => {
        if (!menu.contains(e.target as Node)) {
          document.body.removeChild(menu);
          document.removeEventListener("click", removeMenu);
        }
      };

      // Use setTimeout to avoid immediate removal
      setTimeout(() => {
        document.addEventListener("click", removeMenu);
      }, 0);
    });
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

  // Add a method to get the current metrics
  getMetrics(): PtyMetrics | null {
    return this.metrics;
  }

  // Add a method to enable/disable the bell
  setBellEnabled(enabled: boolean): void {
    this.bellEnabled = enabled;
  }

  // Add a method to get the bell enabled state
  isBellEnabled(): boolean {
    return this.bellEnabled;
  }

  // Add a method to get the current title
  getTitle(): string {
    return this.currentTitle;
  }
}
