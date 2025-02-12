import { invoke } from "@tauri-apps/api/core";
import type { Config } from "../config";
import { TerminalManager } from "./TerminalManager";
import { EventBus } from "../utils/EventBus";

export interface Tab {
  id: string;
  title: string;
  terminalId: string;
  active: boolean;
}

export class TabManager {
  private tabs: Tab[] = [];
  private terminalManager: TerminalManager;
  private tabsList: HTMLElement | null = null;
  private terminalContainer: HTMLElement | null = null;
  private terminalContainers: Map<string, HTMLElement> = new Map();
  private isProfileMenuOpen = false;

  constructor(private readonly config: Config) {
    this.terminalManager = new TerminalManager(config);
    this.initializeUI();

    // Listen for terminal focus events
    EventBus.getInstance().on("terminalFocus", () => {
      this.closeProfileMenu();
    });
  }

  private initializeUI(): void {
    console.log("[initializeUI] Enter");
    console.log("Initializing UI...");
    this.tabsList = document.querySelector(".tabs-list");
    this.terminalContainer = document.getElementById("terminal-container");
    if (!this.tabsList) {
      console.error("Could not find tabs list element");
      throw new Error("Could not find tabs list element");
    }
    if (!this.terminalContainer) {
      console.error("Could not find terminal container");
      throw new Error("Could not find terminal container");
    }

    this.setupTabScrolling();

    // Add new tab button event listeners
    const newTabButton = document.querySelector(".new-tab-button");
    if (newTabButton) {
      console.log("Found new tab button, adding event listener");
      newTabButton.addEventListener("click", (e) => {
        console.log("New tab button clicked");
        e.stopPropagation();
        this.createTab();
      });
    }

    const dropdownButton = document.querySelector(".dropdown-button");
    if (dropdownButton) {
      console.log(
        "[initializeUI] Found dropdown button, adding event listener"
      );
      dropdownButton.addEventListener("click", (e) => {
        console.log("[initializeUI] Dropdown button clicked");
        e.stopPropagation();
        this.toggleProfileMenu();
      });

      dropdownButton.addEventListener("mousedown", (e) => {
        console.log("Dropdown button mousedown");
        e.stopPropagation();
      });
    } else {
      console.error("[initializeUI] Could not find dropdown button");
    }
    console.log("[initializeUI] Exit");
  }

  private createTerminalContainer(id: string): HTMLElement {
    const container = document.createElement("div");
    container.className = "terminal-instance";
    container.dataset.terminalId = id;
    container.style.width = "100%";
    container.style.height = "100%";
    this.terminalContainers.set(id, container);
    return container;
  }

  private updateTabsUI(): void {
    if (!this.tabsList) return;

    this.tabsList.innerHTML = "";

    this.tabs.forEach((tab) => {
      const tabElement = document.createElement("div");
      tabElement.className = `tab ${tab.active ? "active" : ""}`;
      tabElement.dataset.tabId = tab.id;

      // Add click handler for tab switching
      tabElement.addEventListener("click", (e) => {
        e.stopPropagation();
        this.switchTab(tab.id);
      });

      // Add middle click handler
      tabElement.addEventListener("auxclick", (e) => {
        e.stopPropagation();
        if (e.button === 1) {
          // Middle mouse button
          this.closeTab(tab.id);
        }
      });

      // Title part
      const titleElement = document.createElement("span");
      titleElement.textContent = tab.title;
      titleElement.addEventListener("click", (e) => {
        e.stopPropagation();
        this.switchTab(tab.id);
      });
      tabElement.appendChild(titleElement);

      // Close button (only show if we have more than one tab)
      if (this.tabs.length > 1) {
        const closeButton = document.createElement("button");
        closeButton.className = "tab-close";
        closeButton.innerHTML = "×";
        closeButton.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeTab(tab.id);
        });
        tabElement.appendChild(closeButton);
      }

      this.tabsList?.appendChild(tabElement);
    });
  }

  private focusTerminal(terminalId: string): void {
    const terminal = this.terminalManager.getTerminal(terminalId);
    if (terminal) {
      terminal.focus();
    }
  }

  async createFirstTab(): Promise<void> {
    const id = crypto.randomUUID();
    let shellName = this.getDefaultShellName();
    let command: string | undefined;
    let args: string[] | undefined;

    if (this.config.profiles) {
      const defaultProfile = this.config.profiles.list.find(
        (p) => p.name === this.config.profiles?.default
      );
      if (defaultProfile) {
        shellName = defaultProfile.name;
        command = defaultProfile.command;
        args = defaultProfile.args ?? undefined;
      }
    }

    const tab: Tab = {
      id,
      title: shellName,
      terminalId: id,
      active: true,
    };

    this.tabs.push(tab);
    const terminalContainer = this.createTerminalContainer(id);
    this.terminalContainer?.appendChild(terminalContainer);
    const terminal = this.terminalManager.createTerminal(id);
    await terminal.mount(terminalContainer, command, args);
    terminalContainer.style.display = "block";
    terminal.focus();
    this.updateTabsUI();
  }

  private getDefaultShellName(): string {
    const shell = this.config.shell.windows; // TODO: Handle other platforms
    return shell.split(".")[0];
  }

  async createTab(profileName?: string): Promise<void> {
    const id = crypto.randomUUID();

    // Get shell name based on profile or default
    let shellName: string;
    let command: string | undefined;
    let args: string[] | undefined;

    if (profileName && this.config.profiles) {
      const profile = this.config.profiles.list.find(
        (p) => p.name === profileName
      );
      if (profile) {
        shellName = profile.name;
        command = profile.command;
        args = profile.args ?? undefined;
      } else {
        shellName = this.getDefaultShellName();
      }
    } else {
      shellName = this.getDefaultShellName();
    }

    // Update existing tabs
    this.tabs.forEach((t) => {
      t.active = false;
      const container = this.terminalContainers.get(t.terminalId);
      if (container) {
        container.remove();
      }
    });

    const tab: Tab = {
      id,
      title: shellName,
      terminalId: id,
      active: true,
    };

    this.tabs.push(tab);
    const terminalContainer = this.createTerminalContainer(id);
    this.terminalContainer?.appendChild(terminalContainer);
    const terminal = this.terminalManager.createTerminal(id);

    // Mount terminal with profile
    await terminal.mount(terminalContainer, command, args);
    terminalContainer.style.display = "block";
    terminal.focus();
    this.updateTabsUI();
  }

  async closeTab(tabId: string): Promise<void> {
    // Don't close if it's the last tab
    if (this.tabs.length <= 1) return;

    const tabIndex = this.tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const tab = this.tabs[tabIndex];

    // Clean up terminal
    const terminal = this.terminalManager.getTerminal(tab.terminalId);
    if (terminal) {
      // TODO: Add proper handling of running processes before closing tab
      await this.terminalManager.destroyTerminal(tab.terminalId);
    }

    // Remove container
    const container = this.terminalContainers.get(tab.terminalId);
    if (container) {
      container.remove();
      this.terminalContainers.delete(tab.terminalId);
    }

    // Remove tab
    this.tabs.splice(tabIndex, 1);

    // If we closed the active tab, switch to another one
    if (tab.active && this.tabs.length > 0) {
      // Switch to the next tab, or the previous if we closed the last tab
      const nextTabIndex = Math.min(tabIndex, this.tabs.length - 1);
      const nextTab = this.tabs[nextTabIndex];
      this.switchTab(nextTab.id);
    } else {
      // Just update UI if we closed an inactive tab
      this.updateTabsUI();
    }
  }

  switchTab(tabId: string): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab || !this.terminalContainer) return;

    // Update active states
    this.tabs.forEach((t) => {
      t.active = t.id === tabId;
      const container = this.terminalContainers.get(t.terminalId);
      if (container) {
        if (t.active) {
          if (this.terminalContainer && container) {
            // Move container to main container
            this.terminalContainer.innerHTML = "";
            this.terminalContainer.appendChild(container);
          }
          const terminal = this.terminalManager.getTerminal(t.terminalId);
          if (terminal) {
            requestAnimationFrame(() => {
              terminal.fit();
              terminal.focus();
            });
          }
        } else {
          // Remove from DOM but keep reference
          container.remove();
        }
      }
    });

    this.updateTabsUI();
  }

  private toggleProfileMenu(): void {
    const menu = document.querySelector(".profile-menu");

    if (menu) {
      menu.classList.toggle("visible");
    } else {
      this.createProfileMenu();
    }
  }

  private createProfileMenu(): void {
    if (!this.config.profiles) return;

    const menu = document.createElement("div");
    menu.className = "profile-menu";
    menu.addEventListener("click", (e) => e.stopPropagation());

    this.config.profiles.list.forEach((profile) => {
      const item = document.createElement("div");
      item.className = "profile-item";
      item.textContent = profile.name;

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        this.createTab(profile.name);
        this.toggleProfileMenu();
      });

      menu.appendChild(item);
    });

    const newTabContainer = document.querySelector(".new-tab-container");
    if (newTabContainer) {
      newTabContainer.appendChild(menu);
      menu.classList.add("visible");

      // Add global click handler
      const clickHandler = (e: MouseEvent) => {
        e.stopPropagation();
        if (!menu.contains(e.target as Node)) {
          this.closeProfileMenu();
          document.removeEventListener("click", clickHandler);
        }
      };

      // Use setTimeout to avoid immediate trigger
      setTimeout(() => {
        document.addEventListener("click", clickHandler);
      }, 0);
    }
  }

  private closeProfileMenu(): void {
    const menu = document.querySelector(".profile-menu");
    if (menu) {
      menu.classList.remove("visible");
      setTimeout(() => {
        menu.remove();
      }, 100);
    }
  }

  private setupTabScrolling(): void {
    const tabsList = this.tabsList;
    if (!tabsList) return;

    // Create scroll container
    const scrollContainer = document.createElement("div");
    scrollContainer.className = "tabs-scroll";

    // Left scroll button
    const leftButton = document.createElement("button");
    leftButton.className = "tabs-scroll-button";
    leftButton.innerHTML = "◀";
    leftButton.addEventListener("click", (e) => {
      e.stopPropagation();
      tabsList.scrollBy({ left: -100, behavior: "smooth" });
    });

    // Right scroll button
    const rightButton = document.createElement("button");
    rightButton.className = "tabs-scroll-button";
    rightButton.innerHTML = "▶";
    rightButton.addEventListener("click", (e) => {
      e.stopPropagation();
      tabsList.scrollBy({ left: 100, behavior: "smooth" });
    });

    // Add buttons to container
    scrollContainer.appendChild(leftButton);
    scrollContainer.appendChild(rightButton);

    // Insert before window controls
    const windowControls = document.querySelector(".window-controls");
    windowControls?.parentNode?.insertBefore(scrollContainer, windowControls);

    // Update button visibility
    const updateScrollButtons = () => {
      const shouldShow = this.tabs.length >= 3;
      scrollContainer.classList.toggle("visible", shouldShow);

      leftButton.style.display = tabsList.scrollLeft > 0 ? "block" : "none";
      rightButton.style.display =
        tabsList.scrollLeft < tabsList.scrollWidth - tabsList.clientWidth
          ? "block"
          : "none";
    };

    // Initial update
    updateScrollButtons();

    // Update on scroll, resize, and tab changes
    tabsList.addEventListener("scroll", updateScrollButtons);
    window.addEventListener("resize", updateScrollButtons);
    const observer = new MutationObserver(updateScrollButtons);
    observer.observe(tabsList, { childList: true, subtree: true });

    // Also update when tabs are added/removed
    EventBus.getInstance().on("tabsUpdated", updateScrollButtons);
  }
}
