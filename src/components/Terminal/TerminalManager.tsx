import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { v4 as uuidv4 } from "uuid";
import { Terminal, TabLayout, TerminalPane } from "./types";
import { createInitialTab } from "./utils";
import { invoke } from "@tauri-apps/api/core";
import { Config } from "../../config";
import { calculateNewLayout } from "./layout";

interface TerminalContextType {
  tabs: TabLayout[];
  activeTabId: string;
  activeTerminalId: string | null;
  createTab: () => void;
  splitTerminal: (
    terminalId: string,
    direction: "horizontal" | "vertical"
  ) => void;
  focusTerminal: (terminalId: string) => void;
  closeTerminal: (terminalId: string) => void;
}

// Export the context
export const TerminalContext = createContext<TerminalContextType | null>(null);

// Export a hook for using the context
export const useTerminalContext = () => {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error("useTerminalContext must be used within TerminalProvider");
  }
  return context;
};

export const TerminalProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [tabs, setTabs] = useState<TabLayout[]>([createInitialTab()]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(
    tabs[0].terminals[0].id
  );

  const createTab = useCallback(() => {
    const newTab = createInitialTab(tabs.length + 1);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setActiveTerminalId(newTab.terminals[0].id);
  }, [tabs.length]);

  const splitTerminal = useCallback(
    (terminalId: string, direction: "horizontal" | "vertical") => {
      const newTerminalId = uuidv4();

      setTabs((prev) =>
        prev.map((tab) => {
          const terminal = tab.terminals.find((t) => t.id === terminalId);
          if (!terminal) return tab;

          const newTerminal: Terminal = {
            id: newTerminalId, // Store ID for focusing later
            ptyId: null,
          };

          const newLayout = calculateNewLayout(
            tab,
            terminal.id,
            newTerminal.id,
            direction
          );

          return {
            ...tab,
            terminals: [...tab.terminals, newTerminal],
            panes: newLayout.panes,
            gridTemplate: newLayout.gridTemplate,
          };
        })
      );

      // Focus the new terminal after split
      setActiveTerminalId(newTerminalId);
    },
    []
  );

  const focusTerminal = useCallback(
    (terminalId: string) => {
      const tab = tabs.find((t) =>
        t.terminals.some((term) => term.id === terminalId)
      );
      if (tab) {
        setActiveTabId(tab.id);
        setActiveTerminalId(terminalId);
      }
    },
    [tabs]
  );

  const closeTerminal = useCallback((terminalId: string) => {
    setTabs((prev) =>
      prev
        .map((tab) => {
          const terminal = tab.terminals.find((t) => t.id === terminalId);
          if (!terminal) return tab;

          // If it's the last terminal in the tab, remove the tab
          if (tab.terminals.length === 1) {
            return null;
          }

          // Otherwise, remove the terminal and update layout
          return {
            ...tab,
            terminals: tab.terminals.filter((t) => t.id !== terminalId),
            // You'll need to implement layout recalculation here
          };
        })
        .filter((tab): tab is TabLayout => tab !== null)
    );
  }, []);

  // Add keyboard shortcut handling
  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Only handle if Control is pressed
      if (!event.ctrlKey) return;

      try {
        const config = await invoke<Config>("get_config");
        console.log("[Shortcuts] Key pressed:", {
          key: event.key,
          ctrl: event.ctrlKey,
          shift: event.shiftKey,
          alt: event.altKey,
        });

        // Split horizontal (Ctrl+Shift+E)
        const horizontalShortcut = config.shortcuts.split_horizontal;
        if (
          event.ctrlKey === horizontalShortcut.ctrl &&
          event.shiftKey === true &&
          event.key.toLowerCase() === "e"
        ) {
          console.log("[Shortcuts] Horizontal split triggered");
          event.preventDefault();
          if (activeTerminalId) {
            splitTerminal(activeTerminalId, "horizontal");
          }
          return;
        }

        // Split vertical (Ctrl+Shift+O)
        const verticalShortcut = config.shortcuts.split_vertical;
        if (
          event.ctrlKey === verticalShortcut.ctrl &&
          event.shiftKey === true &&
          event.key.toLowerCase() === "o"
        ) {
          console.log("[Shortcuts] Vertical split triggered");
          event.preventDefault();
          if (activeTerminalId) {
            splitTerminal(activeTerminalId, "vertical");
          }
          return;
        }
      } catch (error) {
        console.error("Error handling keyboard shortcut:", error);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTerminalId, splitTerminal]);

  return (
    <TerminalContext.Provider
      value={{
        tabs,
        activeTabId,
        activeTerminalId,
        createTab,
        splitTerminal,
        focusTerminal,
        closeTerminal,
      }}
    >
      {children}
    </TerminalContext.Provider>
  );
};
