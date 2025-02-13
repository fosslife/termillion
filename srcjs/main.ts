import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import "./styles/window-controls.css";
import "./styles/terminal.css";
import "./styles/tabs.css";
import "@xterm/xterm/css/xterm.css";
import { TabManager } from "./terminal/TabManager";
import type { Config } from "./config";
import { ShortcutManager } from "./utils/ShortcutManager";

class App {
  private tabManager: TabManager | null = null;
  private appWindow = getCurrentWindow();
  private shortcutManager: ShortcutManager;

  constructor() {
    this.initializeApp();
  }

  private async initializeApp() {
    // Initialize window controls
    new WindowControls();

    // Load config
    const config = await invoke<Config>("get_config");
    window.__config = config; // Make config available globally

    // Initialize shortcut manager
    this.shortcutManager = ShortcutManager.getInstance(config);

    // Initialize tab manager
    this.tabManager = new TabManager(config);

    // Register shortcuts
    this.registerShortcuts();

    // Create first tab
    await this.tabManager.createFirstTab();

    // Focus window after initialization
    await this.appWindow.setFocus();
  }

  private registerShortcuts(): void {
    // Get the new tab shortcut from config
    const newTabShortcut = this.shortcutManager.getShortcutConfig("new_tab");

    // Register the new tab shortcut
    this.shortcutManager.registerShortcut(newTabShortcut, () => {
      this.tabManager?.createTab();
    });

    // Profile dropdown shortcut
    const profileShortcut =
      this.shortcutManager.getShortcutConfig("show_profiles");
    this.shortcutManager.registerShortcut(profileShortcut, () => {
      this.tabManager?.toggleProfileMenu();
    });
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

// Add config to window object for global access
declare global {
  interface Window {
    __config: Config;
  }
}

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  new App();
});
