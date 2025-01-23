import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isFontAvailable, loadGoogleFont } from "./font-checker";
import { TerminalConfig } from "./config";
import { GoldenLayout, ComponentContainer, LayoutConfig } from "golden-layout";

interface Tab {
  id: string;
  ptyId: string;
  xterm: XTerm;
  fitAddon: FitAddon;
  element: HTMLElement;
  cleanup: () => void;
}

interface Split {
  id: string;
  direction: "horizontal" | "vertical";
  terminals: Tab[];
  container: HTMLElement;
}

export class TabManager {
  private tabs: Map<string, Tab> = new Map();
  private splits: Map<string, Split> = new Map();
  private activeTabId: string | null = null;
  private config: TerminalConfig;
  private container: HTMLElement;
  private tabsContainer: HTMLElement;
  private layout: GoldenLayout;

  constructor(config: TerminalConfig) {
    this.config = config;
    this.container = document.getElementById("terminal") as HTMLElement;
    this.tabsContainer = document.querySelector(".tabs") as HTMLElement;

    // Initialize GoldenLayout with a proper config
    const layoutConfig = {
      settings: {
        showPopoutIcon: false,
        showMaximiseIcon: false,
        showCloseIcon: false,
      },
      content: [
        {
          type: "row",
          content: [],
        },
      ],
    };

    this.layout = new GoldenLayout(this.container);

    // Register terminal component before loading layout
    this.layout.registerComponent("terminal", (container, state) => {
      const terminalElement = document.createElement("div");
      terminalElement.className = "terminal-instance";
      container.getElement().append(terminalElement);

      // Create terminal instance
      this.createTerminalInstance(terminalElement).then((terminal) => {
        this.tabs.set(state.tabId, terminal);
      });
    });

    // Initialize layout after component registration
    this.layout.loadLayout(layoutConfig);

    window.addEventListener("resize", () => {
      this.layout.updateSize();
    });

    this.setupTabControls();
    this.setupKeyboardShortcuts();
  }

  private setupTabControls() {
    // New tab button with profile selection
    const newTabBtn = document.querySelector(".new-tab");
    newTabBtn?.addEventListener("click", (e) => {
      console.log("New tab clicked, ctrlKey:", e.ctrlKey); // Debug log
      if (e.ctrlKey) {
        e.preventDefault(); // Prevent default action
        e.stopPropagation(); // Stop event bubbling
        this.showProfileSelection(e);
      } else {
        this.createTab();
      }
    });

    // Close tab buttons
    document.addEventListener("click", (e) => {
      const closeBtn = (e.target as Element).closest(".tab-close");
      if (closeBtn) {
        const tabElement = closeBtn.closest(".tab");
        if (tabElement) {
          const tabId = tabElement.getAttribute("data-tab-id");
          if (tabId) {
            e.stopPropagation(); // Prevent tab activation
            this.closeTab(tabId);
          }
        }
      }
    });

    // Tab selection
    document.addEventListener("click", (e) => {
      const tabElement = (e.target as Element).closest(".tab");
      if (
        tabElement &&
        !tabElement.querySelector(".tab-close")?.contains(e.target as Node)
      ) {
        const tabId = tabElement.getAttribute("data-tab-id");
        if (tabId) {
          console.log("Tab clicked:", tabId); // Add debug logging
          this.activateTab(tabId);
        }
      }
    });
  }

  private async showProfileSelection(event: MouseEvent) {
    console.log("Profile selection triggered"); // Debug log

    // Create and show profile menu
    const menu = document.createElement("div");
    menu.className = "profile-menu";

    // Add tooltip/hint for keyboard shortcuts
    const hint = document.createElement("div");
    hint.className = "profile-menu-hint";
    hint.textContent = "Tip: Use Alt+[1-9] for quick access";
    menu.appendChild(hint);

    // Get profiles from config
    const profiles = this.config.profiles?.list || [];
    console.log("Available profiles:", profiles); // Debug log

    if (!profiles.length) {
      const noProfiles = document.createElement("div");
      noProfiles.className = "profile-item";
      noProfiles.textContent = "No profiles configured";
      menu.appendChild(noProfiles);
    }

    profiles.forEach((profile, index) => {
      console.log("Creating menu item for profile:", profile.name); // Debug log
      const item = document.createElement("div");
      item.className = "profile-item";

      const nameSpan = document.createElement("span");
      nameSpan.textContent = profile.name;

      const shortcutSpan = document.createElement("span");
      shortcutSpan.className = "profile-shortcut";
      shortcutSpan.textContent = `Alt+${index + 1}`;

      item.appendChild(nameSpan);
      item.appendChild(shortcutSpan);

      item.addEventListener("click", () => {
        this.createTab({ profile: profile.name });
        menu.remove();
      });
      menu.appendChild(item);
    });

    // Position menu near the + button
    const rect = (event.target as Element).getBoundingClientRect();
    menu.style.position = "absolute";
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.left = `${rect.left}px`;
    console.log("Menu position:", {
      top: menu.style.top,
      left: menu.style.left,
    }); // Debug log

    // Close menu when clicking outside
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    };

    // Add menu to DOM
    document.body.appendChild(menu);
    console.log("Menu added to DOM"); // Debug log

    // Add click listener after a small delay to prevent immediate closure
    setTimeout(() => {
      document.addEventListener("click", closeMenu);
    }, 0);
  }

  async createTab(options?: { profile?: string }) {
    const tabId = crypto.randomUUID();

    try {
      // Create component config
      const newItemConfig = {
        type: "component",
        componentName: "terminal",
        componentState: { tabId, profile: options?.profile },
      };

      // Get root content item or create new row
      if (!this.layout.root.contentItems.length) {
        // Create new row
        const rowConfig = {
          type: "row",
          content: [newItemConfig],
        };
        this.layout.addItem(rowConfig);
      } else {
        // Add to existing row
        const rootRow = this.layout.root.contentItems[0];
        this.layout.addItem(newItemConfig, rootRow);
      }

      this.createTabElement(tabId, options?.profile);
      this.activateTab(tabId);

      return tabId;
    } catch (error) {
      console.error("Failed to create tab:", error);
      return null;
    }
  }

  async splitPane(sourceId: string, direction: "horizontal" | "vertical") {
    const sourceTab = this.tabs.get(sourceId);
    if (!sourceTab) return;

    const sourceContainer = this.findComponentContainer(sourceId);
    if (!sourceContainer) return;

    const newTabId = crypto.randomUUID();

    // Create new split configuration
    const splitConfig = {
      type: direction === "horizontal" ? "row" : "column",
      content: [
        {
          type: "component",
          componentName: "terminal",
          componentState: { tabId: newTabId },
        },
      ],
    };

    // Add the new split using layout's addItem method
    this.layout.addItem(splitConfig, sourceContainer.parent);
    this.layout.updateSize();
  }

  private findComponentContainer(terminalId: string): any {
    const findInItem = (item: any): any => {
      if (item.type === "component") {
        if (item.config.componentState?.tabId === terminalId) {
          return item;
        }
      }

      if (item.contentItems) {
        for (const child of item.contentItems) {
          const found = findInItem(child);
          if (found) return found;
        }
      }

      return null;
    };

    return findInItem(this.layout.root);
  }

  private createTabElement(tabId: string, profileName?: string) {
    const tabElement = document.createElement("div");
    tabElement.className = "tab";
    tabElement.setAttribute("data-tab-id", tabId);

    const tabNumber = this.tabs.size;
    const title = profileName
      ? `${profileName} ${tabNumber}`
      : `Terminal ${tabNumber}`;

    tabElement.innerHTML = `
      <span class="tab-title">${title}</span>
      <button class="tab-close">×</button>
    `;

    // Insert before the new tab button
    const newTabBtn = this.tabsContainer.querySelector(".new-tab");
    if (newTabBtn) {
      this.tabsContainer.insertBefore(tabElement, newTabBtn);
    }
  }

  activateTab(tabId: string) {
    console.log("Activating tab:", tabId); // Add debug logging
    const tab = this.tabs.get(tabId);
    if (!tab) {
      console.warn("Tab not found:", tabId);
      return;
    }

    // Hide all terminals
    this.tabs.forEach((t) => {
      t.element.style.display = "none";
    });

    // Show selected terminal
    tab.element.style.display = "block";

    // Update tab classes
    document.querySelectorAll(".tab").forEach((el) => {
      el.classList.remove("active");
    });

    const activeTabElement = document.querySelector(
      `.tab[data-tab-id="${tabId}"]`
    );
    if (activeTabElement) {
      activeTabElement.classList.add("active");
    } else {
      console.warn("Active tab element not found:", tabId);
    }

    this.activeTabId = tabId;
    tab.xterm.focus();
    tab.fitAddon.fit();
  }

  closeTab(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    // Clean up the tab
    tab.cleanup();
    this.tabs.delete(tabId);

    // Remove tab element
    document.querySelector(`.tab[data-tab-id="${tabId}"]`)?.remove();

    // If this was the active tab, activate another one
    if (this.activeTabId === tabId) {
      const nextTab = this.tabs.values().next().value;
      if (nextTab) {
        this.activateTab(nextTab.id);
      }
    }

    // If no tabs left, create a new one
    if (this.tabs.size === 0) {
      this.createTab();
    }
  }

  cleanup() {
    this.tabs.forEach((tab) => tab.cleanup());
    this.tabs.clear();
    this.layout.destroy();
  }

  private setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;

        if (e.key === "[") {
          e.preventDefault();
          this.splitPane(activeTab.id, "horizontal");
        } else if (e.key === "]") {
          e.preventDefault();
          this.splitPane(activeTab.id, "vertical");
        }
      }
    });
  }

  private getActiveTab(): Tab | undefined {
    return this.tabs.get(this.activeTabId);
  }

  private async createTerminal(container: HTMLElement, profile?: string) {
    // Get profile-specific settings if available
    const profileConfig = profile
      ? this.config.profiles?.list.find((p) => p.name === profile)
      : null;

    // Check primary font availability
    let fontFamily = profileConfig?.font?.family || this.config.font.family;
    const isPrimaryFontAvailable = await isFontAvailable(fontFamily);

    if (!isPrimaryFontAvailable) {
      console.log(`Primary font ${fontFamily} not available, trying fallback`);
      fontFamily = this.config.font.fallback_family;

      if (!(await isFontAvailable(fontFamily))) {
        await loadGoogleFont(fontFamily);
      }
    }

    // Merge profile theme with default theme
    const theme = {
      ...this.config.theme,
      ...(profileConfig?.theme || {}),
    };

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: profileConfig?.font?.size || this.config.font.size,
      fontFamily: `${fontFamily}, ${this.config.font.fallback_family}`,
      theme: {
        background: theme.background,
        foreground: theme.foreground,
        cursor: theme.cursor,
        selectionBackground: theme.selection,
        // ANSI colors
        black: theme.black,
        red: theme.red,
        green: theme.green,
        yellow: theme.yellow,
        blue: theme.blue,
        magenta: theme.magenta,
        cyan: theme.cyan,
        white: theme.white,
        // Bright variants
        brightBlack: theme.bright_black,
        brightRed: theme.bright_red,
        brightGreen: theme.bright_green,
        brightYellow: theme.bright_yellow,
        brightBlue: theme.bright_blue,
        brightMagenta: theme.bright_magenta,
        brightCyan: theme.bright_cyan,
        brightWhite: theme.bright_white,
      },
      allowProposedApi: true,
      scrollback:
        this.config.terminal.scrollback === "infinite"
          ? Infinity
          : this.config.terminal.scrollback,
      convertEol: false,
      cursorStyle: "block",
      cols: 80,
      rows: 24,
      lineHeight: 1,
      fontWeight: "normal",
      fontWeightBold: "bold",
      allowTransparency: false,
      scrollOnUserInput: true,
      screenReaderMode: false,
      macOptionIsMeta: true,
      rightClickSelectsWord: false,
    });

    // Try WebGL addon
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      xterm.loadAddon(webglAddon);
    } catch (e) {
      console.warn("WebGL addon could not be loaded", e);
    }

    xterm.loadAddon(new WebLinksAddon());
    xterm.open(container);
    return xterm;
  }

  private async createTerminalInstance(
    container: HTMLElement,
    options?: { profile?: string }
  ): Promise<Tab> {
    try {
      // Create xterm instance
      const xterm = await this.createTerminal(container, options?.profile);
      const fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);

      // Fit before creating PTY to get correct dimensions
      fitAddon.fit();

      // Get profile-specific command
      const profileName = options?.profile || this.config.profiles?.default;
      const profile = profileName
        ? this.config.profiles?.list.find((p) => p.name === profileName)
        : null;

      // Create PTY with profile command if available
      const ptyId = (await invoke("create_pty", {
        cwd: "~",
        rows: xterm.rows,
        cols: xterm.cols,
        command: profile?.command,
        args: profile?.args,
      })) as string;

      // Set up event listeners
      const unlisten = await getCurrentWindow().listen(
        `pty://output/${ptyId}`,
        (event: any) => {
          if (typeof event.payload === "string") {
            const isUserScrolled = xterm.buffer.active.viewportY > 0;
            const currentLine = xterm.buffer.active.cursorY;
            xterm.write(event.payload);

            // Only auto-scroll if we're near the bottom
            if (!isUserScrolled || currentLine >= xterm.rows - 3) {
              xterm.scrollToBottom();
            }
          }
        }
      );

      // Handle input
      xterm.onData((data) => {
        invoke("write_pty", {
          ptyId,
          data,
        });
      });

      // Handle resize
      let resizeTimeout: number;
      const handleResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          fitAddon.fit();
          // Get the new dimensions after fit
          const dims = {
            rows: xterm.rows,
            cols: xterm.cols,
          };
          invoke("resize_pty", {
            ptyId,
            ...dims,
          });
          // Force a viewport refresh
          xterm.refresh(0, xterm.rows - 1);
        }, 100) as unknown as number;
      };

      window.addEventListener("resize", handleResize);
      // Also handle parent container resize
      const resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(container);

      // Update cleanup to include ResizeObserver
      const cleanup = () => {
        unlisten();
        window.removeEventListener("resize", handleResize);
        resizeObserver.disconnect();
        xterm.dispose();
        invoke("destroy_pty", { ptyId });
      };

      const terminal: Tab = {
        id: crypto.randomUUID(),
        ptyId,
        xterm,
        fitAddon,
        element: container,
        cleanup,
      };

      // Initial fit
      setTimeout(() => {
        fitAddon.fit();
        xterm.focus();
      }, 0);

      return terminal;
    } catch (error) {
      console.error("Failed to create terminal instance:", error);
      throw error;
    }
  }
}
