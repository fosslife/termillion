import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ValidationError } from "./config";
import WindowControls from "./components/WindowControls";
import "./styles/error-banner.css";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  saveWindowState,
  restoreStateCurrent,
  StateFlags,
} from "@tauri-apps/plugin-window-state";
import ErrorBanner from "./components/ErrorBanner";
import { ConfigProvider, useConfig } from "./contexts/ConfigContext";
import { isFontAvailable, loadGoogleFont } from "./font-checker";
import { Terminal } from "./components/Terminal/Terminal";
import { Tabs, TabsList, Tab } from "./components/Terminal/Tabs";

// Separate component for app content to use config hook
const AppContent: React.FC = () => {
  const { config, loading } = useConfig();
  const [activeTab, setActiveTab] = useState("hello");
  const [activeTerminal, setActiveTerminal] = useState("terminal-1");
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

  const tabs = [
    { id: "hello", label: "Hello" },
    { id: "world", label: "World" },
    { id: "third", label: "Third Tab" },
  ];

  return (
    <div className="app">
      <ErrorBanner errors={validationErrors} />
      <WindowControls />
      <Tabs defaultTab="hello">
        <TabsList tabs={tabs} />
        <div style={{ position: "relative", flex: 1 }}>
          <Tab id="hello">
            <Terminal
              active={true}
              id="terminal-1"
              onFocus={() => setActiveTerminal("terminal-1")}
            />
          </Tab>
          <Tab id="world">
            <Terminal
              active={true}
              id="terminal-2"
              onFocus={() => setActiveTerminal("terminal-2")}
            />
          </Tab>
          <Tab id="third">
            <Terminal
              active={true}
              id="terminal-3"
              onFocus={() => setActiveTerminal("terminal-3")}
            />
          </Tab>
        </div>
      </Tabs>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ConfigProvider>
      <AppContent />
    </ConfigProvider>
  );
};

export default App;
