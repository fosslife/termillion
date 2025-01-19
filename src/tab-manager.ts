import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isFontAvailable, loadGoogleFont } from "./font-checker";
import { TerminalConfig } from "./config";

interface Tab {
  id: string;
  ptyId: string;
  xterm: XTerm;
  fitAddon: FitAddon;
  element: HTMLElement;
  cleanup: () => void;
}

export class TabManager {
  private tabs: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private config: TerminalConfig;
  private container: HTMLElement;
  private tabsContainer: HTMLElement;

  constructor(config: TerminalConfig) {
    this.config = config;
    this.container = document.getElementById("terminal") as HTMLElement;
    this.tabsContainer = document.querySelector(".tabs") as HTMLElement;
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
    // Close any open profile menu
    document.querySelector(".profile-menu")?.remove();

    const tabId = crypto.randomUUID();
    const terminalElement = document.createElement("div");
    terminalElement.className = "terminal-instance";
    terminalElement.style.display = "none";
    this.container.appendChild(terminalElement);

    try {
      // Get profile-specific command
      const profileName = options?.profile || this.config.profiles?.default;
      const profile = profileName
        ? this.config.profiles?.list.find((p) => p.name === profileName)
        : null;

      // Create xterm instance
      const xterm = await this.createTerminal(terminalElement, profile?.name);
      const fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);

      // Fit before creating PTY to get correct dimensions
      fitAddon.fit();

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
      resizeObserver.observe(terminalElement);

      // Update cleanup to include ResizeObserver
      const cleanup = () => {
        unlisten();
        window.removeEventListener("resize", handleResize);
        resizeObserver.disconnect();
        xterm.dispose();
        invoke("destroy_pty", { ptyId });
        terminalElement.remove();
      };

      // Create tab object and add to map before creating the element
      const tab: Tab = {
        id: tabId,
        ptyId,
        xterm,
        fitAddon,
        element: terminalElement,
        cleanup,
      };

      // Add to map first
      this.tabs.set(tabId, tab);

      // Then create the element (which will use the correct size)
      this.createTabElement(tabId, profile?.name);

      // Finally activate the tab
      this.activateTab(tabId);

      // Initial fit
      setTimeout(() => {
        fitAddon.fit();
        xterm.focus();
      }, 0);
    } catch (error) {
      console.error("Failed to create tab:", error);
      terminalElement.remove();
    }
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
  }

  private setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      // Alt + number for quick profile access
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
          const profiles = this.config.profiles?.list || [];
          const profile = profiles[num - 1];
          if (profile) {
            e.preventDefault();
            this.createTab({ profile: profile.name });
          }
        }
      }
    });
  }
}
