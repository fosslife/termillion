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
  private terminalsBeingClosed = new Set<string>(); // Track terminals being closed

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

    // Listen for terminal exit events
    EventBus.getInstance().on(EventBus.TERMINAL_EXIT, async (ptyId: string) => {
      console.log(`Terminal exit event received for pty: ${ptyId}`);
      console.log(
        `Current tabs:`,
        this.tabs.map((t) => ({
          id: t.id,
          terminalId: t.terminalId,
          active: t.active,
        }))
      );

      // Skip if this terminal is already being closed
      if (this.terminalsBeingClosed.has(ptyId)) {
        console.log(
          `Terminal ${ptyId} is already being closed, ignoring duplicate exit event`
        );
        return;
      }

      // Find the tab with this terminal ID
      let tab = this.tabs.find((t) => t.terminalId === ptyId);

      // If no tab found with matching terminalId, check all tabs
      if (!tab) {
        console.log(`No tab found with terminalId=${ptyId}, checking all tabs`);

        // Check all tabs to see if any have a matching ptyId in their container
        for (const t of this.tabs) {
          const container = this.terminalContainers.get(t.id);
          if (container && container.dataset.ptyId === ptyId) {
            console.log(
              `Found tab ${t.id} with container having ptyId=${ptyId}`
            );
            tab = t;
            // Update the tab's terminal ID to match the actual PTY ID
            tab.terminalId = ptyId;
            break;
          }
        }
      }

      if (tab) {
        console.log(`Found tab ${tab.id} for terminal ${ptyId}, closing it`);

        // Mark this terminal as being closed
        this.terminalsBeingClosed.add(ptyId);

        try {
          // Force close the tab since the terminal has exited
          await this.closeTab(tab.id, true);
          console.log(`Tab ${tab.id} closed successfully`);
        } catch (error) {
          console.error(`Error closing tab ${tab.id}:`, error);
        } finally {
          // Remove from the set after closing
          this.terminalsBeingClosed.delete(ptyId);
        }
      } else {
        console.log(`No tab found for terminal ${ptyId}, cannot close tab`);
      }
    });

    this.profileManager = new ProfileManager(config, (profiles) => {
      this.config.profiles = profiles;
      this.saveConfig();
      EventBus.getInstance().emit(EventBus.PROFILE_CHANGED);
    });
  }

  public getActiveTab(): Tab | null {
    return this.tabs.find((t) => t.active) ?? null;
  }

  public getTotalTabs(): number {
    return this.tabs.length;
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
    console.log(`Creating terminal container for id=${id}`);

    // Create a new container element
    const container = document.createElement("div");
    container.className = "terminal-instance";
    container.dataset.tabId = id; // Store the tab ID
    container.style.width = "100%";
    container.style.height = "100%";

    // Store the container in our map using the tab ID as the key
    this.terminalContainers.set(id, container);

    console.log(`Terminal container created for id=${id}`);
    return container;
  }

  private updateTabsUI(): void {
    console.log(`Updating tabs UI, tab count: ${this.tabs.length}`);
    if (!this.tabsList) {
      console.log("Tab list element not found");
      return;
    }

    this.tabsList.innerHTML = "";

    this.tabs.forEach((tab) => {
      console.log(`Creating UI for tab ${tab.id}, active: ${tab.active}`);
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

      if (this.tabsList) {
        this.tabsList.appendChild(tabElement);
      }
    });

    console.log("Tabs UI update complete");
  }

  async createFirstTab(): Promise<void> {
    // Generate a unique ID for this tab
    const id = crypto.randomUUID();
    console.log(`Creating first tab with id=${id}`);

    // Get shell configuration
    let shellName = await this.getDefaultShellName();
    let command: string | undefined;
    let args: string[] | undefined;

    // Check if we have a default profile
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

    // Create a new tab object
    const tab: Tab = {
      id,
      title: shellName,
      terminalId: id, // Initially use the tab ID as the terminal ID
      active: true, // First tab is active by default
    };

    // Add the tab to our list
    this.tabs.push(tab);
    console.log(`Added first tab ${id} to tabs list`);

    // Create terminal container
    const terminalContainer = this.createTerminalContainer(id);

    // Make sure the main container is empty
    if (this.terminalContainer) {
      this.terminalContainer.innerHTML = "";
      this.terminalContainer.appendChild(terminalContainer);
    } else {
      console.error("Main terminal container not found");
      return;
    }

    // Store the container in our map
    this.terminalContainers.set(id, terminalContainer);
    console.log(`Created container for first tab ${id}`);

    // Create terminal
    const terminal = this.terminalManager.createTerminal(id);
    console.log(`Created terminal for first tab ${id}`);

    // Mount terminal with profile
    await terminal.mount(terminalContainer, command, args);
    console.log(`Mounted terminal for first tab ${id}`);

    // Update the tab with the actual PTY ID
    const ptyId = terminal.getPtyId();
    if (ptyId) {
      console.log(`Updating first tab ${id} with actual ptyId=${ptyId}`);
      tab.terminalId = ptyId;
    } else {
      console.warn(`Failed to get ptyId for first terminal ${id}`);
    }

    // Make sure the container is visible
    terminalContainer.style.display = "block";

    // Focus the terminal
    terminal.focus();

    // Update the UI
    this.updateTabsUI();
    console.log(`First tab ${id} creation complete`);
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

    // Generate a unique ID for this tab
    const id = crypto.randomUUID();
    console.log(`Creating new tab with id=${id}`);

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

    // Create a new tab object
    const tab: Tab = {
      id,
      title: shellName,
      terminalId: id, // Initially use the tab ID as the terminal ID
      active: false, // Will be set to active when we switch to it
    };

    // Add the tab to our list
    this.tabs.push(tab);
    console.log(
      `Added tab ${id} to tabs list, total tabs: ${this.tabs.length}`
    );

    // Create terminal container
    const terminalContainer = this.createTerminalContainer(id);
    this.terminalContainers.set(id, terminalContainer);
    console.log(`Created container for tab ${id}`);

    // Create terminal
    const terminal = this.terminalManager.createTerminal(id, () => {
      // Focus handler
      const activeTab = this.tabs.find((t) => t.active);
      if (activeTab?.terminalId !== id) {
        this.switchTab(tab.id);
      }
    });
    console.log(`Created terminal for tab ${id}`);

    // Mount the terminal
    await terminal.mount(terminalContainer, command, args);
    console.log(`Mounted terminal for tab ${id}`);

    // Update the tab with the actual PTY ID
    const ptyId = terminal.getPtyId();
    if (ptyId) {
      console.log(`Updating tab ${id} with actual ptyId=${ptyId}`);
      tab.terminalId = ptyId;
    } else {
      console.warn(`Failed to get ptyId for terminal ${id}`);
    }

    // Switch to the new tab
    this.switchTab(id);
  }

  async closeTab(tabId: string, forceClose: boolean = false): Promise<void> {
    console.log(
      `Closing tab ${tabId}, forceClose=${forceClose}, tabCount=${this.tabs.length}`
    );

    // Don't close if it's the last tab, unless forced (e.g., due to terminal exit)
    if (this.tabs.length <= 1 && !forceClose) {
      console.log("Not closing last tab without forceClose");
      return; // Don't close the last tab in normal circumstances
    }

    // Find the tab to close
    const tabIndex = this.tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) {
      console.log(`Tab ${tabId} not found`);
      return;
    }

    const tab = this.tabs[tabIndex];
    console.log(
      `Found tab at index ${tabIndex}, id=${tab.id}, terminalId=${tab.terminalId}`
    );

    // Store whether this tab was active before removing it
    const wasActive = tab.active;

    // Clean up terminal
    const terminal = this.terminalManager.getTerminal(tab.id);
    if (terminal) {
      console.log(`Destroying terminal for tab ${tab.id}`);
      try {
        await this.terminalManager.destroyTerminal(tab.id);
      } catch (error) {
        console.error(`Error destroying terminal for tab ${tab.id}:`, error);
        // Continue with tab closure even if terminal destruction fails
      }
    } else {
      console.log(`Terminal for tab ${tab.id} not found or already destroyed`);
    }

    // Remove container
    const container = this.terminalContainers.get(tab.id);
    if (container) {
      console.log(`Removing container for tab ${tab.id}`);
      container.remove();
      this.terminalContainers.delete(tab.id);
    } else {
      console.log(`Container for tab ${tab.id} not found`);
    }

    // Remove tab from the array
    this.tabs.splice(tabIndex, 1);
    console.log(`Removed tab, remaining tabs: ${this.tabs.length}`);

    // If this is the last tab and we're force closing (due to terminal exit),
    // close the entire window instead of creating a new tab
    if (this.tabs.length === 0 && forceClose) {
      console.log("Last tab closed due to terminal exit, closing window");
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
      return;
    }

    // If we closed the active tab, switch to another one
    if (wasActive && this.tabs.length > 0) {
      // Switch to the next tab, or the previous if we closed the last tab
      const nextTabIndex = Math.min(tabIndex, this.tabs.length - 1);
      const nextTab = this.tabs[nextTabIndex];
      console.log(`Switching to tab ${nextTab.id}`);
      this.switchTab(nextTab.id);
    } else {
      // Just update UI if we closed an inactive tab
      console.log("Updating UI for inactive tab closure");
      this.updateTabsUI();
    }

    // If we closed the last tab (but not due to terminal exit), create a new tab
    if (this.tabs.length === 0) {
      console.log("No tabs left, creating a new tab");
      await this.createFirstTab();
    }

    console.log("Tab closure complete");
  }

  switchTab(tabId: string): void {
    console.log(`Switching to tab ${tabId}`);

    // Find the tab we want to switch to
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) {
      console.log(`Tab ${tabId} not found`);
      return;
    }

    if (!this.terminalContainer) {
      console.log(`Terminal container not found`);
      return;
    }

    console.log(`Found tab ${tabId}, terminalId=${tab.terminalId}`);

    // First, hide all terminal containers and mark all tabs as inactive
    this.tabs.forEach((t) => {
      // Update active state
      const wasActive = t.active;
      t.active = t.id === tabId;

      // Log the state change
      if (wasActive !== t.active) {
        console.log(
          `Tab ${t.id} active state changed: ${wasActive} -> ${t.active}`
        );
      }

      // Get the container for this tab using the tab ID
      const container = this.terminalContainers.get(t.id);
      if (!container) {
        console.log(`Container for tab ${t.id} not found`);
        return;
      }

      // Remove all containers from the DOM
      if (container.parentElement) {
        container.remove();
      }
    });

    // Now, show the active tab's container
    const activeContainer = this.terminalContainers.get(tab.id);
    if (!activeContainer) {
      console.log(`Container for active tab ${tab.id} not found`);
      return;
    }

    // Clear the main container and add the active container
    this.terminalContainer.innerHTML = "";
    this.terminalContainer.appendChild(activeContainer);
    console.log(`Added container for tab ${tab.id} to main container`);

    // Focus and fit the terminal
    const terminal = this.terminalManager.getTerminal(tab.id);
    if (terminal) {
      console.log(`Focusing terminal for tab ${tab.id}`);
      terminal.focus();
      terminal.fit();
    } else {
      console.log(`Terminal for tab ${tab.id} not found`);
    }

    // Update the UI to reflect the new active tab
    this.updateTabsUI();
    console.log(`Tab switch to ${tabId} complete`);
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
