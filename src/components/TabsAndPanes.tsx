import React, { createContext, useContext, useState, useCallback } from "react";
import Terminal from "./Terminal";
import { v4 as uuidv4 } from "uuid";
import { useSplitResize } from "../hooks/useSplitResize";

interface Pane {
  id: string;
  terminalId: string;
}

interface Split {
  direction: "horizontal" | "vertical";
  ratio: number;
  first: Pane | Split;
  second: Pane | Split;
}

interface Tab {
  id: string;
  name: string;
  content: Pane | Split;
}

interface TabsContextType {
  tabs: Tab[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  splitPane: (paneId: string, direction: "horizontal" | "vertical") => void;
  createTab: () => void;
  closeTab: (tabId: string) => void;
  activePane: string | null;
  setActivePane: (id: string | null) => void;
}

const TabsContext = createContext<TabsContextType | null>(null);

export const TabsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: "initial-tab",
      name: "Terminal 1",
      content: {
        id: "initial-pane",
        terminalId: "terminal-1",
      },
    },
  ]);
  const [activeTabId, setActiveTabId] = useState("initial-tab");
  const [activePane, setActivePane] = useState<string | null>("initial-pane");

  const createTab = useCallback(() => {
    const newId = uuidv4();
    const terminalId = `terminal-${newId}`;
    const newTab: Tab = {
      id: newId,
      name: `Terminal ${tabs.length + 1}`,
      content: {
        id: `pane-${newId}`,
        terminalId,
      },
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  }, [tabs.length]);

  const closeTab = useCallback(
    (tabId: string) => {
      if (tabs.length === 1) return; // Don't close last tab

      setTabs((prev) => prev.filter((tab) => tab.id !== tabId));
      if (activeTabId === tabId) {
        // Activate the previous tab or the first one
        const index = tabs.findIndex((tab) => tab.id === tabId);
        const newActiveId = tabs[index - 1]?.id || tabs[index + 1]?.id;
        setActiveTabId(newActiveId);
      }
    },
    [tabs, activeTabId]
  );

  const splitPane = useCallback(
    (paneId: string, direction: "horizontal" | "vertical") => {
      const newTerminalId = `terminal-${uuidv4()}`;
      const newPaneId = `pane-${uuidv4()}`;

      setTabs((prev) =>
        prev.map((tab) => {
          const splitContent = (
            content: Pane | Split
          ): Pane | Split | undefined => {
            if ("terminalId" in content) {
              if (content.id === paneId) {
                return {
                  direction,
                  ratio: 0.5,
                  first: content,
                  second: {
                    id: newPaneId,
                    terminalId: newTerminalId,
                  },
                };
              }
              return content;
            }

            // Search in split panes
            const firstResult = splitContent(content.first);
            if (firstResult !== content.first) {
              return { ...content, first: firstResult };
            }

            const secondResult = splitContent(content.second);
            if (secondResult !== content.second) {
              return { ...content, second: secondResult };
            }

            return content;
          };

          return {
            ...tab,
            content: splitContent(tab.content) || tab.content,
          };
        })
      );

      // Set focus to the new pane after splitting
      setActivePane(newPaneId);

      // Use setTimeout to ensure the new terminal is mounted
      setTimeout(() => {
        const terminalElement = document.querySelector(
          `[data-terminal-id="${newTerminalId}"] .xterm-helper-textarea`
        ) as HTMLTextAreaElement;
        terminalElement?.focus();
      }, 0);
    },
    [setActivePane]
  );

  return (
    <TabsContext.Provider
      value={{
        tabs,
        activeTabId,
        setActiveTabId,
        createTab,
        closeTab,
        splitPane,
        activePane,
        setActivePane,
      }}
    >
      {children}
    </TabsContext.Provider>
  );
};

// Hook for using the tabs context
export const useTabsContext = () => {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("useTabsContext must be used within a TabsProvider");
  }
  return context;
};

const PaneView: React.FC<{ content: Pane | Split }> = ({ content }) => {
  const { activePane, setActivePane } = useTabsContext();
  const [ratio, setRatio] = useState(0.5);
  const { containerRef, dividerRef } = useSplitResize({
    direction: "terminalId" in content ? "vertical" : content.direction,
    onResize: setRatio,
    minRatio: 0.2,
    maxRatio: 0.8,
  });

  if ("terminalId" in content) {
    return (
      <div
        className={`pane ${activePane === content.id ? "active" : ""}`}
        data-pane-id={content.id}
        data-terminal-id={content.terminalId}
        onClick={() => setActivePane(content.id)}
      >
        <Terminal id={content.terminalId} />
      </div>
    );
  }

  return (
    <div className={`split ${content.direction}`} ref={containerRef}>
      <div className="split-first" style={{ flex: ratio }}>
        <PaneView content={content.first} />
      </div>
      <div className="split-divider" ref={dividerRef} />
      <div className="split-second" style={{ flex: 1 - ratio }}>
        <PaneView content={content.second} />
      </div>
    </div>
  );
};

export const TabsAndPanes: React.FC = () => {
  const { tabs, activeTabId, setActiveTabId, closeTab } = useTabsContext();

  return (
    <div className="tabs-and-panes">
      <div className="tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${activeTabId === tab.id ? "active" : ""}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span className="tab-name">{tab.name}</span>
            {tabs.length > 1 && (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="panes">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-content ${activeTabId === tab.id ? "active" : ""}`}
          >
            <PaneView content={tab.content} />
          </div>
        ))}
      </div>
    </div>
  );
};
