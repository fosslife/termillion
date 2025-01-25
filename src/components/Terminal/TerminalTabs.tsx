import React, { useContext } from "react";
import { TerminalContext } from "./TerminalManager";
import { TerminalView } from "./TerminalView";
import "./TerminalTabs.css";

export const TerminalTabs: React.FC = () => {
  const context = useContext(TerminalContext);
  if (!context)
    throw new Error("TerminalTabs must be used within TerminalProvider");

  const { tabs, activeTabId, activeTerminalId, createTab, focusTerminal } =
    context;

  return (
    <div className="terminal-tabs">
      <div className="tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${activeTabId === tab.id ? "active" : ""}`}
            onClick={() => focusTerminal(tab.terminals[0].id)}
          >
            <span>{tab.name}</span>
            {tabs.length > 1 && (
              <button
                className="close-tab"
                onClick={(e) => {
                  e.stopPropagation();
                  // closeTab(tab.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button className="new-tab" onClick={createTab}>
          +
        </button>
      </div>
      <div className="tab-content">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-panel ${activeTabId === tab.id ? "active" : ""}`}
          >
            <TerminalView
              tab={tab}
              activeTerminalId={activeTerminalId}
              onTerminalFocus={focusTerminal}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
