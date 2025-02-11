import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import "./styles/window-controls.css";
import "./styles/terminal.css";
import "@xterm/xterm/css/xterm.css";
import { TerminalManager } from "./terminal/TerminalManager";
import type { Config } from "./config";

class App {
  private terminalManager: TerminalManager | null = null;

  constructor() {
    this.initializeApp();
  }

  private async initializeApp() {
    // Initialize window controls
    new WindowControls();

    // Load config
    const config = await invoke<Config>("get_config");

    // Initialize terminal manager
    this.terminalManager = new TerminalManager(config);

    // Create first terminal
    const terminal = this.terminalManager.createTerminal(crypto.randomUUID());

    // Mount terminal
    const container = document.getElementById("terminal-container");
    if (container) {
      await terminal.mount(container);
    }
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
