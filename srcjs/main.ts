import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import "./styles/window-controls.css";
import "./styles/terminal.css";
import "./styles/tabs.css";
import "@xterm/xterm/css/xterm.css";
import { TabManager } from "./terminal/TabManager";
import type { Config } from "./config";

class App {
  private tabManager: TabManager | null = null;
  private appWindow = getCurrentWindow();

  constructor() {
    this.initializeApp();
  }

  private async initializeApp() {
    // Initialize window controls
    new WindowControls();

    // Load config
    const config = await invoke<Config>("get_config");

    // Initialize tab manager
    this.tabManager = new TabManager(config);

    // Create first tab
    await this.tabManager.createFirstTab();

    // Focus window after initialization
    await this.appWindow.setFocus();
  }
}

class WindowControls {
  private appWindow = getCurrentWindow();

  constructor() {
    this.initializeControls();
  }

  private initializeControls() {
    const minimizeBtn = document.querySelector(
      '[data-window-control="minimize"]'
    );
    const maximizeBtn = document.querySelector(
      '[data-window-control="maximize"]'
    );
    const closeBtn = document.querySelector('[data-window-control="close"]');

    minimizeBtn?.addEventListener("click", () => this.appWindow.minimize());
    maximizeBtn?.addEventListener("click", this.handleMaximize.bind(this));
    closeBtn?.addEventListener("click", () => this.appWindow.close());
  }

  private async handleMaximize() {
    const isMaximized = await this.appWindow.isMaximized();
    if (isMaximized) {
      this.appWindow.unmaximize();
    } else {
      this.appWindow.maximize();
    }
  }
}

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  new App();
});
