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
  }

  private setupTabControls() {
    // New tab button
    const newTabBtn = document.querySelector(".new-tab");
    newTabBtn?.addEventListener("click", () => this.createTab());

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

  async createTab() {
    const tabId = crypto.randomUUID();
    const terminalElement = document.createElement("div");
    terminalElement.className = "terminal-instance";
    terminalElement.style.display = "none";
    this.container.appendChild(terminalElement);

    try {
      // Create xterm instance
      const xterm = await this.createTerminal(terminalElement);
      const fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);

      // Create PTY
      const ptyId = (await invoke("create_pty", {
        cwd: "~",
        rows: xterm.rows,
        cols: xterm.cols,
      })) as string; // Add type assertion here

      // Set up event listeners
      const unlisten = await getCurrentWindow().listen(
        `pty://output/${ptyId}`,
        (event: any) => {
          xterm.write(event.payload);
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
          invoke("resize_pty", {
            ptyId,
            rows: xterm.rows,
            cols: xterm.cols,
          });
        }, 100) as unknown as number;
      };

      window.addEventListener("resize", handleResize);

      // Create cleanup function
      const cleanup = () => {
        unlisten();
        window.removeEventListener("resize", handleResize);
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
      this.createTabElement(tabId);

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

  private async createTerminal(container: HTMLElement) {
    // Check primary font availability
    let fontFamily = this.config.font.family;
    const isPrimaryFontAvailable = await isFontAvailable(fontFamily);

    if (!isPrimaryFontAvailable) {
      console.log(`Primary font ${fontFamily} not available, trying fallback`);
      fontFamily = this.config.font.fallback_family;

      if (!(await isFontAvailable(fontFamily))) {
        await loadGoogleFont(fontFamily);
      }
    }

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: this.config.font.size,
      fontFamily: `${fontFamily}, ${this.config.font.fallback_family}`,
      theme: {
        background: this.config.theme.background,
        foreground: this.config.theme.foreground,
        cursor: this.config.theme.cursor,
        selectionBackground: this.config.theme.selection,
      },
      allowProposedApi: true,
      scrollback:
        this.config.terminal.scrollback === "infinite"
          ? Infinity
          : this.config.terminal.scrollback,
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

  private createTabElement(tabId: string) {
    const tabElement = document.createElement("div");
    tabElement.className = "tab";
    tabElement.setAttribute("data-tab-id", tabId);

    // Use current size for tab number since the tab is already in the map
    const tabNumber = this.tabs.size;

    tabElement.innerHTML = `
      <span class="tab-title">Terminal ${tabNumber}</span>
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
}
