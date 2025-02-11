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
  // @ts-ignore
  private activeTerminalId: string | null = null;

  constructor(private readonly config: Config) {
    this.terminalManager = new TerminalManager(config);
    this.initializeUI();
  }

  private initializeUI(): void {
    this.tabsList = document.querySelector(".tabs-list");
    if (!this.tabsList) {
      throw new Error("Could not find tabs list element");
    }
  }

  private updateTabsUI(): void {
    if (!this.tabsList) return;

    this.tabsList.innerHTML = "";

    this.tabs.forEach((tab) => {
      const tabElement = document.createElement("button");
      tabElement.className = `tab ${tab.active ? "active" : ""}`;
      tabElement.textContent = tab.title;
      tabElement.dataset.tabId = tab.id;

      tabElement.addEventListener("click", () => {
        this.switchTab(tab.id);
      });

      this.tabsList?.appendChild(tabElement);
    });
  }

  private focusTerminal(terminalId: string): void {
    const terminal = this.terminalManager.getTerminal(terminalId);
    if (terminal) {
      terminal.focus();
      this.activeTerminalId = terminalId;
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
    const terminal = this.terminalManager.createTerminal(id);

    const container = document.getElementById("terminal-container");
    if (container) {
      await terminal.mount(container);
      this.focusTerminal(id);
    }
    this.updateTabsUI();
  }

  private getDefaultShellName(): string {
    const shell = this.config.shell.windows; // TODO: Handle other platforms
    return shell.split(".")[0];
  }

  // Placeholder functions for future implementation
  async createTab(): Promise<void> {
    // TODO: Implement new tab creation
  }

  async closeTab(_: string): Promise<void> {
    // TODO: Implement tab closing
  }

  switchTab(tabId: string): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (tab) {
      this.focusTerminal(tab.terminalId);
    }
  }
}
