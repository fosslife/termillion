import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import Terminal from "./Terminal";
import { v4 as uuidv4 } from "uuid";
import { useSplitResize } from "../hooks/useSplitResize";

// Core types
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

// Context type
interface TabsContextType {
  tabs: Tab[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  splitPane: (paneId: string, direction: "horizontal" | "vertical") => void;
  createTab: () => void;
  closeTab: (tabId: string) => void;
  activePane: string | null;
  setActivePane: (id: string | null) => void;
  focusNextPane: () => void;
  focusPreviousPane: () => void;
  closePane: (paneId: string) => void;
}

const TabsContext = createContext<TabsContextType | null>(null);

// Provider Component
export const TabsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // State
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

  // Add useEffect for initial focus
  useEffect(() => {
    // Focus initial terminal after mount
    requestAnimationFrame(() => {
      const terminalElement = document.querySelector(
        '[data-terminal-id="terminal-1"]'
      );
      if (terminalElement) {
        const terminal = (terminalElement as any)._reactInternals?.child?.ref
          ?.current;
        terminal?.focus();
      }
    });
  }, []); // Empty dependency array for mount only

  // Create new tab
  const createTab = useCallback(() => {
    const newId = uuidv4();
    const terminalId = `terminal-${newId}`;
    const paneId = `pane-${newId}`;

    const newTab: Tab = {
      id: newId,
      name: `Terminal ${tabs.length + 1}`,
      content: {
        id: paneId,
        terminalId,
      },
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setActivePane(paneId);

    // Focus new terminal
    requestAnimationFrame(() => {
      const terminal = document.querySelector(
        `[data-terminal-id="${terminalId}"]`
      );
      if (terminal) {
        (terminal as any)._reactInternals?.child?.ref?.current?.focus();
      }
    });
  }, [tabs.length]);

  // Split pane
  const splitPane = useCallback(
    (paneId: string, direction: "horizontal" | "vertical") => {
      const newTerminalId = `terminal-${uuidv4()}`;
      const newPaneId = `pane-${uuidv4()}`;

      setTabs((prev) =>
        prev.map((tab) => {
          // Helper function to process the content tree
          function processContent(node: Pane | Split): Pane | Split {
            // If this is a pane we want to split
            if ("terminalId" in node && node.id === paneId) {
              return {
                direction,
                ratio: 0.5,
                first: node, // Keep original pane unchanged
                second: {
                  // Create new pane
                  id: newPaneId,
                  terminalId: newTerminalId,
                },
              };
            }

            // If this is a different pane
            if ("terminalId" in node) {
              return node;
            }

            // If this is a split, process its children
            const newFirst = processContent(node.first);
            const newSecond = processContent(node.second);

            // If nothing changed in the children
            if (newFirst === node.first && newSecond === node.second) {
              return node;
            }

            // Create new split with updated children
            return {
              ...node,
              first: newFirst,
              second: newSecond,
            };
          }

          // Process the tab's content
          const newContent = processContent(tab.content);

          // If nothing changed in this tab
          if (newContent === tab.content) {
            return tab;
          }

          // Create new tab with updated content
          return { ...tab, content: newContent };
        })
      );

      // Focus the new pane
      setActivePane(newPaneId);

      // Focus the new terminal
      requestAnimationFrame(() => {
        const terminal = document.querySelector(
          `[data-terminal-id="${newTerminalId}"]`
        );
        if (terminal) {
          (terminal as any)._reactInternals?.child?.ref?.current?.focus();
        }
      });
    },
    []
  );

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

  const focusNextPane = useCallback(() => {
    if (!activePane) return;

    // Find all panes in current tab
    const currentTab = tabs.find((tab) => tab.id === activeTabId);
    if (!currentTab) return;

    const paneIds: string[] = [];
    const collectPaneIds = (content: Pane | Split) => {
      if ("terminalId" in content) {
        paneIds.push(content.id);
      } else {
        collectPaneIds(content.first);
        collectPaneIds(content.second);
      }
    };
    collectPaneIds(currentTab.content);

    // Find current pane index and focus next
    const currentIndex = paneIds.indexOf(activePane);
    if (currentIndex !== -1) {
      const nextIndex = (currentIndex + 1) % paneIds.length;
      setActivePane(paneIds[nextIndex]);
    }
  }, [activePane, activeTabId, tabs]);

  const focusPreviousPane = useCallback(() => {
    // Similar to focusNextPane but reverse direction
    if (!activePane) return;

    const currentTab = tabs.find((tab) => tab.id === activeTabId);
    if (!currentTab) return;

    const paneIds: string[] = [];
    const collectPaneIds = (content: Pane | Split) => {
      if ("terminalId" in content) {
        paneIds.push(content.id);
      } else {
        collectPaneIds(content.first);
        collectPaneIds(content.second);
      }
    };
    collectPaneIds(currentTab.content);

    const currentIndex = paneIds.indexOf(activePane);
    if (currentIndex !== -1) {
      const prevIndex = (currentIndex - 1 + paneIds.length) % paneIds.length;
      setActivePane(paneIds[prevIndex]);
    }
  }, [activePane, activeTabId, tabs]);

  const closePane = useCallback(
    (paneId: string) => {
      // Don't close if it's the last pane in the last tab
      if (tabs.length === 1) {
        const onlyTab = tabs[0];
        if ("terminalId" in onlyTab.content && onlyTab.content.id === paneId) {
          return;
        }
      }

      setTabs((prev) =>
        prev
          .map((tab) => {
            const newContent = removePaneFromContent(tab.content, paneId);
            // If this was the last pane in the tab, remove the tab
            if (!newContent) {
              return null;
            }
            return { ...tab, content: newContent };
          })
          .filter((tab): tab is Tab => tab !== null)
      );
    },
    [tabs]
  );

  // Helper function to remove a pane from content
  const removePaneFromContent = (
    content: Pane | Split,
    paneId: string
  ): (Pane | Split) | null => {
    if ("terminalId" in content) {
      return content.id === paneId ? null : content;
    }

    const firstResult = removePaneFromContent(content.first, paneId);
    const secondResult = removePaneFromContent(content.second, paneId);

    if (!firstResult) return secondResult;
    if (!secondResult) return firstResult;
    return content;
  };

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
        focusNextPane,
        focusPreviousPane,
        closePane,
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
  const terminalRef = useRef<{ focus: () => void }>(null);

  // Fix direction logic
  const splitDirection = !("terminalId" in content)
    ? content.direction
    : "horizontal";

  const { containerRef, dividerRef } = useSplitResize({
    direction: splitDirection,
    onResize: (newRatio) => {
      console.log("[PaneView] Resize:", { newRatio, splitDirection });
      setRatio(newRatio);
    },
    minRatio: 0.2,
    maxRatio: 0.8,
  });

  if ("terminalId" in content) {
    return (
      <div
        className={`pane ${activePane === content.id ? "active" : ""}`}
        data-pane-id={content.id}
        data-terminal-id={content.terminalId}
        onClick={() => {
          setActivePane(content.id);
          terminalRef.current?.focus();
        }}
      >
        <Terminal ref={terminalRef} id={content.terminalId} />
      </div>
    );
  }

  return (
    <div
      className={`split ${content.direction}`}
      ref={containerRef}
      data-split-direction={content.direction}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
      }}
    >
      <div
        className="split-first"
        style={{
          position: "absolute",
          ...(content.direction === "horizontal"
            ? {
                width: "100%",
                height: `${ratio * 100}%`,
                top: 0,
                left: 0,
              }
            : {
                width: `${ratio * 100}%`,
                height: "100%",
                left: 0,
                top: 0,
              }),
        }}
      >
        <PaneView content={content.first} />
      </div>
      <div
        className="split-divider"
        ref={dividerRef}
        data-direction={content.direction}
      />
      <div
        className="split-second"
        style={{
          position: "absolute",
          ...(content.direction === "horizontal"
            ? {
                width: "100%",
                height: `${(1 - ratio) * 100}%`,
                top: `${ratio * 100}%`,
                left: 0,
              }
            : {
                width: `${(1 - ratio) * 100}%`,
                height: "100%",
                left: `${ratio * 100}%`,
                top: 0,
              }),
        }}
      >
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
