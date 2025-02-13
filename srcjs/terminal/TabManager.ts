import { invoke } from "@tauri-apps/api/core";
import type { Config, Profile } from "../config";
import { TerminalManager } from "./TerminalManager";
import { EventBus } from "../utils/EventBus";
import { ProfileManager } from "./ProfileManager";
import { platform } from "@tauri-apps/plugin-os";

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
  private profileManager: ProfileManager;
  private currentModalCleanup: (() => void) | null = null;

  constructor(private readonly config: Config) {
    console.log("TabManager config:", config);
    this.terminalManager = new TerminalManager(config);
    this.initializeUI();

    // Listen for terminal focus events
    EventBus.getInstance().on("terminalFocus", () => {
      this.closeProfileMenu();
    });

    // Listen for number key events
    EventBus.getInstance().on("numberKeyPressed", (index: number) => {
      this.handleNumberKey(index);
    });

    this.profileManager = new ProfileManager(config, (profiles) => {
      this.config.profiles = profiles;
      this.saveConfig();
      EventBus.getInstance().emit(EventBus.PROFILE_CHANGED);
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

  async createFirstTab(): Promise<void> {
    const id = crypto.randomUUID();
    let shellName = await this.getDefaultShellName();
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

  private async getDefaultShellName(): Promise<string> {
    try {
      const currentPlatform = await platform();
      switch (currentPlatform) {
        case "windows":
          return this.config.shell.windows;
        case "linux":
          return this.config.shell.linux;
        case "macos":
          return this.config.shell.macos;
        default:
          return "/bin/bash";
      }
    } catch (error) {
      console.error("Error detecting platform:", error);
      return "/bin/bash";
    }
  }

  private validateProfile(profileName: string): boolean {
    if (!this.config.profiles) return false;

    const profile = this.config.profiles.list.find(
      (p) => p.name === profileName
    );
    if (!profile) {
      console.error(`Profile "${profileName}" not found`);
      return false;
    }

    if (!profile.command) {
      console.error(`Profile "${profileName}" has no command specified`);
      return false;
    }

    return true;
  }

  async createTab(profileName?: string): Promise<void> {
    if (profileName && !this.validateProfile(profileName)) {
      return;
    }
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
        shellName = await this.getDefaultShellName();
      }
    } else {
      shellName = await this.getDefaultShellName();
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

  public async toggleProfileMenu(): Promise<void> {
    const menu = document.querySelector(".profile-menu");

    if (menu) {
      if (menu.classList.contains("visible")) {
        this.closeProfileMenu();
      } else {
        await this.createProfileMenu();
        this.isProfileMenuOpen = true;
      }
    } else {
      await this.createProfileMenu();
      this.isProfileMenuOpen = true;
    }
  }

  private async createProfileMenu(): Promise<void> {
    // Handle null profiles by creating a default profile list
    if (!this.config.profiles || this.config.profiles === null) {
      const defaultShell = await this.getDefaultShellName();
      this.config.profiles = {
        default: "Default",
        list: [
          {
            name: "Default",
            command: defaultShell,
            args: [],
          },
        ],
      };
    }

    // Check if profiles list is empty
    if (!this.config.profiles.list?.length) {
      return;
    }

    // Create modal container
    const modal = document.createElement("div");
    modal.className = "profile-modal";
    modal.tabIndex = -1;

    // Create menu container
    const menu = document.createElement("div");
    menu.className = "profile-menu";

    // Add profile items with numbers
    this.config.profiles.list.forEach((profile, index) => {
      const item = document.createElement("div");
      item.className = "profile-item";
      item.textContent = `${index + 1}. ${profile.name}`;

      item.addEventListener("click", () => {
        this.createTab(profile.name);
        this.closeProfileMenu();
      });

      // Add hover effect to profile items
      item.addEventListener("mouseenter", () => {
        item.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
      });
      item.addEventListener("mouseleave", () => {
        item.style.backgroundColor = "";
      });

      menu.appendChild(item);
    });

    // Add management button
    const manageItem = document.createElement("div");
    manageItem.className = "profile-item manage";
    manageItem.textContent = "Manage Profiles...";

    manageItem.addEventListener("click", () => {
      this.showProfileManager();
      this.closeProfileMenu();
    });
    menu.appendChild(manageItem);

    // Add close button
    const closeButton = document.createElement("button");
    closeButton.className = "modal-close";
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => this.closeProfileMenu());

    modal.appendChild(closeButton);
    modal.appendChild(menu);
    document.body.appendChild(modal);

    // Focus the modal
    modal.focus();

    // Handle key events
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle number keys
      if (/^[1-9]$/.test(e.key)) {
        const index = parseInt(e.key);
        const profile = this.getProfileByIndex(index);
        if (profile) {
          this.createTab(profile.name);
          this.closeProfileMenu();
        }
        return;
      }

      // Close on Escape
      if (e.key === "Escape") {
        this.closeProfileMenu();
      }
    };

    // Handle outside clicks
    const handleOutsideClick = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        this.closeProfileMenu();
      }
    };

    // Add event listeners
    const handleBlur = () => {
      if (this.isProfileMenuOpen) {
        this.closeProfileMenu();
      }
    };

    modal.addEventListener("keydown", handleKeyDown);
    modal.addEventListener("blur", handleBlur);
    document.addEventListener("click", handleOutsideClick);

    // Store cleanup functions
    this.currentModalCleanup = () => {
      modal.removeEventListener("keydown", handleKeyDown);
      modal.removeEventListener("blur", handleBlur);
      document.removeEventListener("click", handleOutsideClick);
    };

    this.isProfileMenuOpen = true;
  }

  private closeProfileMenu(): void {
    if (!this.isProfileMenuOpen) return;

    const modal = document.querySelector(".profile-modal");
    if (modal && document.body.contains(modal)) {
      // Clean up event listeners
      if (this.currentModalCleanup) {
        this.currentModalCleanup();
        this.currentModalCleanup = null;
      }

      modal.remove();
      this.isProfileMenuOpen = false;
    }
  }

  private setupTabScrolling(): void {
    const tabsList = this.tabsList;
    if (!tabsList) return;

    // Create left scroll button
    const leftButton = document.createElement("button");
    leftButton.className = "tabs-scroll-button left";
    leftButton.innerHTML = "◀";
    leftButton.addEventListener("click", (e) => {
      e.stopPropagation();
      tabsList.scrollBy({ left: -100, behavior: "smooth" });
    });

    // Create right scroll button
    const rightButton = document.createElement("button");
    rightButton.className = "tabs-scroll-button right";
    rightButton.innerHTML = "▶";
    rightButton.addEventListener("click", (e) => {
      e.stopPropagation();
      tabsList.scrollBy({ left: 100, behavior: "smooth" });
    });

    // Insert left button before tabs list
    tabsList.parentNode?.insertBefore(leftButton, tabsList);

    // Insert right button after new tab container
    const newTabContainer = document.querySelector(".new-tab-container");
    if (newTabContainer) {
      newTabContainer.parentNode?.insertBefore(
        rightButton,
        newTabContainer.nextSibling
      );
    }

    // Update button visibility
    const updateScrollButtons = () => {
      const shouldShow = this.tabs.length >= 3;
      leftButton.style.display = shouldShow ? "block" : "none";
      rightButton.style.display = shouldShow ? "block" : "none";

      leftButton.style.visibility =
        tabsList.scrollLeft > 0 ? "visible" : "hidden";
      rightButton.style.visibility =
        tabsList.scrollLeft < tabsList.scrollWidth - tabsList.clientWidth
          ? "visible"
          : "hidden";
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

  private showProfileManager(): void {
    this.profileManager.show();
  }

  private async saveConfig(): Promise<void> {
    try {
      await invoke("save_config", { config: this.config });
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  }

  private handleNumberKey(index: number): void {
    if (!this.isProfileMenuOpen) return;

    const profile = this.getProfileByIndex(index);
    if (profile) {
      this.createTab(profile.name);
      this.closeProfileMenu();
    }
  }

  private getProfileByIndex(index: number): Profile | null {
    if (!this.config.profiles?.list?.length) return null;

    // Convert to zero-based index
    const profileIndex = index - 1;
    if (profileIndex >= 0 && profileIndex < this.config.profiles.list.length) {
      return this.config.profiles.list[profileIndex];
    }
    return null;
  }
}
