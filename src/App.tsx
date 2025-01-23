import React, { useState, useEffect, useRef } from "react";
import {
  Layout,
  Model,
  TabNode,
  Actions,
  IJsonModel,
  DockLocation,
} from "flexlayout-react";
import "flexlayout-react/style/dark.css";
import Terminal from "./components/Terminal";
import WindowControls from "./components/WindowControls";
import { invoke } from "@tauri-apps/api/core";
import { Config } from "./config";

// Debug helper
const DEBUG = true;
const log = (...args: any[]) => {
  if (DEBUG) console.log("[App]", ...args);
};

// Initial layout with just one terminal
const json: IJsonModel = {
  global: {
    tabSetMinWidth: 100,
    tabSetMinHeight: 100,
    borderMinSize: 100,
    enableEdgeDock: true,
    rootOrientationVertical: false,
    tabSetHeaderHeight: 0, // Hide header initially
    tabSetTabStripHeight: 32,
    tabEnableClose: false,
    tabEnableRename: false,
  },
  borders: [],
  layout: {
    type: "row",
    weight: 100,
    children: [
      {
        type: "tabset",
        weight: 100,
        selected: 0,
        enableTabStrip: false, // Hide tab strip initially
        children: [
          {
            type: "tab",
            name: "Terminal 1",
            component: "terminal",
            id: "terminal-1",
          },
        ],
      },
    ],
  },
};

const App: React.FC = () => {
  const terminalCountRef = useRef(1);
  const terminalsRef = useRef(new Set<string>()); // Track created terminals
  const [model] = useState(() => {
    const m = Model.fromJson(json);
    log("Initial model created");
    return m;
  });

  // Initialize first terminal
  useEffect(() => {
    terminalsRef.current.add("terminal-1");
    log("Added initial terminal to tracking");
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeTabset = model.getActiveTabset();
      if (!activeTabset) {
        log("No active tabset found");
        return;
      }

      const activeTab = activeTabset.getSelectedNode();
      if (!activeTab) {
        log("No active tab found");
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "e") {
        log("Horizontal split triggered");
        event.preventDefault();
        splitPane(activeTab as TabNode, "horizontal");
      } else if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "o"
      ) {
        log("Vertical split triggered");
        event.preventDefault();
        splitPane(activeTab as TabNode, "vertical");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [model]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = (await invoke("get_config")) as Config;

        // Now we have proper type checking
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

        if (config.terminal?.padding) {
          document.documentElement.style.setProperty(
            "--terminal-padding-x",
            `${config.terminal.padding.x}px`
          );
          document.documentElement.style.setProperty(
            "--terminal-padding-y",
            `${config.terminal.padding.y}px`
          );
        }
      } catch (error) {
        console.error("Failed to load config:", error);
      }
    };

    loadConfig();
  }, []);

  const splitPane = (tab: TabNode, direction: "horizontal" | "vertical") => {
    terminalCountRef.current += 1;
    const newCount = terminalCountRef.current;
    const newId = `terminal-${newCount}`;

    log("Creating new terminal:", newId);

    if (model.getNodeById(newId)) {
      log("Error: Duplicate terminal ID detected:", newId);
      return;
    }

    // Track the new terminal
    terminalsRef.current.add(newId);
    log("Current terminals:", Array.from(terminalsRef.current));

    const newTabJson = {
      type: "tab",
      name: `Terminal ${newCount}`,
      component: "terminal",
      id: newId,
      config: {},
    };

    const currentTabset = tab.getParent();
    if (!currentTabset) {
      log("Error: No parent tabset found");
      return;
    }

    // Enable tab strip when splitting
    model.doAction(
      Actions.updateNodeAttributes(currentTabset.getId(), {
        enableTabStrip: true,
      })
    );

    log("Adding new node to model:", {
      direction,
      parentId: currentTabset.getId(),
      newTabJson,
    });

    // Add the new node
    model.doAction(
      Actions.addNode(
        newTabJson,
        currentTabset.getId(),
        direction === "horizontal" ? DockLocation.BOTTOM : DockLocation.RIGHT,
        -1,
        true
      )
    );

    // Focus the new tab after a short delay to ensure it's mounted
    setTimeout(() => {
      const newNode = model.getNodeById(newId);
      if (newNode) {
        model.doAction(Actions.selectTab(newNode.getId()));
      }
    }, 50);
  };

  const factory = (node: TabNode) => {
    const component = node.getComponent();
    const id = node.getId();

    log("Factory called for:", { component, id });

    if (component === "terminal") {
      if (!terminalsRef.current.has(id)) {
        log("Warning: Terminal factory called for untracked ID:", id);
        terminalsRef.current.add(id);
      }
      log("Creating terminal component for:", id);
      return <Terminal key={id} id={id} />;
    }

    log("Warning: Unknown component type:", component);
    return null;
  };

  return (
    <div className="app">
      <WindowControls />
      <Layout
        model={model}
        factory={factory}
        onModelChange={() => {
          log("Model changed:", {
            terminals: Array.from(terminalsRef.current),
            modelJson: model.toJson(),
          });
        }}
        onRenderTab={(node, renderValues) => {
          // Ensure the terminal gets focus when its tab is selected
          if (node.isSelected()) {
            const terminalElement = document.querySelector(
              `[data-terminal-id="${node.getId()}"]`
            );
            if (terminalElement) {
              terminalElement.querySelector(".xterm-helper-textarea")?.focus();
            }
          }
          return null; // Use default tab rendering
        }}
      />
    </div>
  );
};

export default App;
