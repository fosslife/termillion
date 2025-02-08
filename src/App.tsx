import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ValidationError } from "./config";
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
import { ConfigProvider, useConfig } from "./contexts/ConfigContext";
import { isFontAvailable, loadGoogleFont } from "./font-checker";

// Separate component for app content to use config hook
const AppContent: React.FC = () => {
  const { config, loading } = useConfig();
  console.log("[App] Config loaded:", { config, loading });
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );

  useEffect(() => {
    if (!config) return;

    // Load font if needed
    const loadFont = async () => {
      if (config.font.family !== "monospace") {
        const isFontLoaded = await isFontAvailable(config.font.family);
        if (!isFontLoaded) {
          await loadGoogleFont(config.font.family);
        }
      }
    };
    loadFont().catch(console.error);

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

    // Validate config
    invoke<ValidationError[]>("validate_config").then(setValidationErrors);
  }, [config]);

  // Window state restoration
  useEffect(() => {
    restoreStateCurrent(StateFlags.ALL);
    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onCloseRequested(() => {
      saveWindowState(StateFlags.ALL);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  if (loading) return null; // Or loading indicator

  return (
    <div className="app">
      <ErrorBanner errors={validationErrors} />
      <WindowControls />
      <TerminalTabs />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ConfigProvider>
      <TerminalProvider>
        <TabsProvider>
          <AppContent />
        </TabsProvider>
      </TerminalProvider>
    </ConfigProvider>
  );
};

export default App;
