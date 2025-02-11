import type { Config } from "../config";
import { TerminalManager } from "./TerminalManager";

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

  constructor(private readonly config: Config) {
    this.terminalManager = new TerminalManager(config);
    this.initializeUI();
  }

  private initializeUI(): void {
    this.tabsList = document.querySelector(".tabs-list");
    this.terminalContainer = document.getElementById("terminal-container");
    if (!this.tabsList) {
      throw new Error("Could not find tabs list element");
    }
    if (!this.terminalContainer) {
      throw new Error("Could not find terminal container");
    }
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

      // Title part
      const titleElement = document.createElement("span");
      titleElement.textContent = tab.title;
      titleElement.addEventListener("click", () => {
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

    const newTabButton = document.createElement("button");
    newTabButton.className = "tab new-tab";
    newTabButton.textContent = "+";
    newTabButton.addEventListener("click", () => {
      this.createTab();
    });

    this.tabsList?.appendChild(newTabButton);
  }

  private focusTerminal(terminalId: string): void {
    const terminal = this.terminalManager.getTerminal(terminalId);
    if (terminal) {
      terminal.focus();
    }
  }

  async createFirstTab(): Promise<void> {
    const id = crypto.randomUUID();
    const shellName = this.getDefaultShellName();

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
    await terminal.mount(terminalContainer);
    terminalContainer.style.display = "block";
    terminal.focus();
    this.updateTabsUI();
  }

  private getDefaultShellName(): string {
    const shell = this.config.shell.windows; // TODO: Handle other platforms
    return shell.split(".")[0];
  }

  async createTab(): Promise<void> {
    const id = crypto.randomUUID();
    const shellName = this.getDefaultShellName();

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
    await terminal.mount(terminalContainer);
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
      try {
        // Send SIGINT (Ctrl+C) before destroying
        await invoke("write_pty", {
          ptyId: tab.terminalId,
          data: "\x03",
        });

        // Small delay to let the process handle the signal
        await new Promise((resolve) => setTimeout(resolve, 100));

        await this.terminalManager.destroyTerminal(tab.terminalId);
      } catch (error) {
        console.error("Failed to destroy terminal:", error);
        // Maybe the process is still running
        if (confirm("Terminal may have running processes. Force close?")) {
          // Force destroy the terminal
          await this.terminalManager.destroyTerminal(tab.terminalId);
        } else {
          return; // Don't proceed with closing if user cancels
        }
      }
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
          // Move container to main container
          this.terminalContainer.innerHTML = "";
          this.terminalContainer.appendChild(container);
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
}
