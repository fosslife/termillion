import React, { useEffect, useState, useRef } from "react";
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

type TerminalTab = {
  id: string;
  label: string;
  terminalId: string;
};

const AppContent: React.FC = () => {
  const { config, loading } = useConfig();
  const [activeTab, setActiveTab] = useState<string>("");
  const [tabs, setTabs] = useState<TerminalTab[]>([]);

  const terminalRefs = useRef(
    new Map<string, { focus: () => void; fit: () => void }>()
  );

  const addTab = async () => {
    if (!config) return;

    const id = crypto.randomUUID();

    const shell = config.shell.windows;
    const shellName = shell.split(".")[0];

    const newTab = {
      id,
      label: shellName,
      terminalId: id,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTab(id);

    const unlisten = await getCurrentWindow().listen(`pty://exit/${id}`, () => {
      closeTab(id);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  };

  const closeTab = (tabId: string) => {
    if (tabs.length === 1) return;

    invoke("destroy_pty", { ptyId: tabId }).catch(console.error);

    const newTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(newTabs);

    if (activeTab === tabId) {
      setActiveTab(newTabs[newTabs.length - 1].id);
    }
  };

  // Initialize first tab only when config is loaded
  useEffect(() => {
    const initializeFirstTab = async () => {
      if (config && tabs.length === 0) {
        await addTab();
        // Force a focus on the terminal after a short delay
        setTimeout(() => {
          const firstTabId = tabs[0]?.id;
          if (firstTabId) {
            terminalRefs.current.get(firstTabId)?.focus();
          }
        }, 100);
      }
    };

    initializeFirstTab();
  }, [config]); // Only run when config loads

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
      <Tabs defaultTab={activeTab} key={activeTab}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <TabsList tabs={tabs} onClose={closeTab} />
          <button
            onClick={addTab}
            style={{
              padding: "4px 8px",
              margin: "4px",
              background: "#333",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              borderRadius: "4px",
            }}
          >
            +
          </button>
        </div>
        <div style={{ position: "relative", flex: 1 }}>
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              id={tab.id}
              onActivate={() => terminalRefs.current.get(tab.id)?.focus()}
            >
              <Terminal
                ref={(ref) => {
                  if (ref) {
                    terminalRefs.current.set(tab.id, ref);
                  } else {
                    terminalRefs.current.delete(tab.id);
                  }
                }}
                active={true}
                id={tab.terminalId}
                onFocus={() => setActiveTab(tab.id)}
              />
            </Tab>
          ))}
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
