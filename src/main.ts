import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TerminalConfig } from "./config";
import { TabManager } from "./tab-manager";

const appWindow = getCurrentWindow();
let currentConfig: TerminalConfig;
let tabManager: TabManager;

window.addEventListener("DOMContentLoaded", () => {
  // Set up window control buttons
  const closeBtn = document.querySelector(".close");
  const minimizeBtn = document.querySelector(".minimize");
  const maximizeBtn = document.querySelector(".maximize");

  closeBtn?.addEventListener("click", async () => {
    // First cleanup tabs
    if (tabManager) {
      tabManager.cleanup();
    }
    // Then close the window
    await appWindow.close();
  });
  minimizeBtn?.addEventListener("click", () => appWindow.minimize());
  maximizeBtn?.addEventListener("click", () => appWindow.toggleMaximize());

  // Initialize terminal
  initConfig().then(() => {
    initTerminal();
    applyConfig();
  });
});

async function initConfig() {
  try {
    currentConfig = await invoke("get_config");
  } catch (error) {
    console.error("Failed to load config:", error);
  }
}

function applyConfig() {
  const terminal = document.getElementById("terminal");
  if (!terminal) return;

  // Apply theme CSS variables
  document.documentElement.style.setProperty(
    "--terminal-bg",
    currentConfig.theme.background
  );
  document.documentElement.style.setProperty(
    "--terminal-fg",
    currentConfig.theme.foreground
  );
  document.documentElement.style.setProperty(
    "--terminal-cursor",
    currentConfig.theme.cursor
  );
  document.documentElement.style.setProperty(
    "--terminal-selection",
    currentConfig.theme.selection
  );
}

async function initTerminal() {
  try {
    tabManager = new TabManager(currentConfig);
    await tabManager.createTab(); // Create initial tab

    // Remove the window close listener since we're handling it with the close button
    // appWindow.listen("tauri://close-requested", () => {
    //   tabManager.cleanup();
    // });
  } catch (error) {
    console.error("Failed to initialize terminal:", error);
  }
}
