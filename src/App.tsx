import React, { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Config } from "./config";
import WindowControls from "./components/WindowControls";
import {
  TabsProvider,
  TabsAndPanes,
  useTabsContext,
} from "./components/TabsAndPanes";
import "./styles/tabs-and-panes.css";

// Keyboard shortcuts handler component
const KeyboardShortcuts: React.FC = () => {
  const { createTab, splitPane, activePane } = useTabsContext();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+T: New tab
      if (event.ctrlKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        createTab();
      }
      // Ctrl+Shift+E: Split horizontal
      else if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "e"
      ) {
        event.preventDefault();
        if (activePane) {
          splitPane(activePane, "horizontal");
        }
      }
      // Ctrl+Shift+O: Split vertical
      else if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        if (activePane) {
          splitPane(activePane, "vertical");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createTab, splitPane, activePane]);

  return null;
};

const App: React.FC = () => {
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await invoke<Config>("get_config");
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

    loadConfig();
  }, []);

  return (
    <TabsProvider>
      <div className="app">
        <WindowControls />
        <TabsAndPanes />
        <KeyboardShortcuts />
      </div>
    </TabsProvider>
  );
};

export default App;
