import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Config, ValidationError } from "./config";
import WindowControls from "./components/WindowControls";
import {
  TabsProvider,
  TabsAndPanes,
  useTabsContext,
} from "./components/TabsAndPanes";
import "./styles/tabs-and-panes.css";
import "./styles/error-banner.css";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  saveWindowState,
  restoreStateCurrent,
  StateFlags,
} from "@tauri-apps/plugin-window-state";
import ErrorBanner from "./components/ErrorBanner";

// Keyboard shortcuts handler component
const KeyboardShortcuts: React.FC = () => {
  const {
    createTab,
    splitPane,
    activePane,
    closeTab,
    closePane,
    focusNextPane,
    focusPreviousPane,
    activeTabId,
  } = useTabsContext();
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await invoke<Config>("get_config");
        setConfig(cfg);
      } catch (error) {
        console.error("Failed to load shortcuts config:", error);
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    if (!config) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Helper function to check if shortcut matches
      const matchesShortcut = (shortcut: Shortcut): boolean => {
        if (event.ctrlKey !== shortcut.ctrl) return false;
        if (event.shiftKey !== (shortcut.shift ?? false)) return false;
        if (event.altKey !== (shortcut.alt ?? false)) return false;
        if (event.metaKey !== (shortcut.meta ?? false)) return false;
        return event.key.toLowerCase() === shortcut.key.toLowerCase();
      };

      // New tab
      if (matchesShortcut(config.shortcuts.new_tab)) {
        event.preventDefault();
        createTab();
      }
      // Close tab
      else if (matchesShortcut(config.shortcuts.close_tab)) {
        event.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
      }
      // Split vertical
      else if (matchesShortcut(config.shortcuts.split_vertical)) {
        event.preventDefault();
        if (activePane) {
          splitPane(activePane, "vertical");
        }
      }
      // Split horizontal
      else if (matchesShortcut(config.shortcuts.split_horizontal)) {
        event.preventDefault();
        if (activePane) {
          splitPane(activePane, "horizontal");
        }
      }
      // Focus next pane
      else if (matchesShortcut(config.shortcuts.focus_next_pane)) {
        event.preventDefault();
        focusNextPane();
      }
      // Focus previous pane
      else if (matchesShortcut(config.shortcuts.focus_previous_pane)) {
        event.preventDefault();
        focusPreviousPane();
      }
      // Close pane
      else if (matchesShortcut(config.shortcuts.close_pane)) {
        event.preventDefault();
        if (activePane) {
          closePane(activePane);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    config,
    createTab,
    closeTab,
    activeTabId,
    splitPane,
    activePane,
    closePane,
    focusNextPane,
    focusPreviousPane,
  ]);

  return null;
};

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

      setConfig(config);
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
    <TabsProvider>
      <div className="app">
        <ErrorBanner errors={validationErrors} />
        <WindowControls />
        <TabsAndPanes />
        <KeyboardShortcuts />
      </div>
    </TabsProvider>
  );
};

export default App;
