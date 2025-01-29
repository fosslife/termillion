import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Config, ValidationError } from "./config";
import WindowControls from "./components/WindowControls";
import { TabsProvider } from "./components/TabsAndPanes";
import "./styles/tabs-and-panes.css";
import "./styles/error-banner.css";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  saveWindowState,
  restoreStateCurrent,
  StateFlags,
} from "@tauri-apps/plugin-window-state";
import ErrorBanner from "./components/ErrorBanner";
import { TerminalProvider } from "./components/Terminal/TerminalManager";
import { TerminalTabs } from "./components/Terminal/TerminalTabs";

const App: React.FC = () => {
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );

  useEffect(() => {
    // Window state restoration
    restoreStateCurrent(StateFlags.ALL);
    const appWindow = getCurrentWindow();
    let unlisten = appWindow.onCloseRequested(() => {
      saveWindowState(StateFlags.ALL);
    });

    return () => {
      unlisten.then((unlisten) => unlisten());
    };
  }, []);

  // Extract config loading into a function
  const loadConfig = async () => {
    try {
      const config = await invoke<Config>("get_config");
      const errors = await invoke<ValidationError[]>("validate_config");
      setValidationErrors(errors);

      // Set CSS variables for theme
      document.documentElement.style.setProperty(
        "--terminal-bg",
        config.theme.background
      );
      document.documentElement.style.setProperty(
        "--terminal-fg",
        config.theme.foreground
      );
      document.documentElement.style.setProperty(
        "--terminal-border",
        config.theme.border ?? "#24283b"
      );
      document.documentElement.style.setProperty(
        "--terminal-header",
        config.theme.header ?? "#16161e"
      );
    } catch (error) {
      console.error("Failed to load config:", error);
    }
  };

  // Add keyboard shortcut for reload
  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      const config = await invoke<Config>("get_config");
      const shortcut = config.shortcuts.reload_config;

      // Match modifiers
      if (event.ctrlKey !== shortcut.ctrl) return;
      if (event.shiftKey !== (shortcut.shift ?? false)) return;
      if (event.altKey !== (shortcut.alt ?? false)) return;
      if (event.metaKey !== (shortcut.meta ?? false)) return;

      // Match key
      if (event.key.toLowerCase() === shortcut.key.toLowerCase()) {
        event.preventDefault();
        await loadConfig();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Initial config load
  useEffect(() => {
    loadConfig();
  }, []);

  return (
    <TerminalProvider>
      <TabsProvider>
        <div className="app">
          <ErrorBanner errors={validationErrors} />
          <WindowControls />
          <TerminalTabs />
        </div>
      </TabsProvider>
    </TerminalProvider>
  );
};

export default App;
