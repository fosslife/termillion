import React from "react";
import { Terminal } from "./Terminal";
import "./TerminalView.css";
import { TabLayout } from "./types";
import { useConfig } from "../../contexts/ConfigContext";

interface TerminalViewProps {
  tab: TabLayout;
  activeTerminalId: string | null;
  onTerminalFocus: (id: string) => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({
  tab,
  activeTerminalId,
  onTerminalFocus,
}) => {
  const { config } = useConfig();

  console.log("[TerminalView] Rendering", {
    tab,
    activeTerminalId,
    panes: tab.panes,
    gridTemplate: tab.gridTemplate,
  });

  // Use memo to prevent unnecessary re-renders
  const renderedPanes = React.useMemo(
    () =>
      tab.panes.map((pane, index, array) => (
        <div
          key={pane.id}
          className={`terminal-pane ${
            activeTerminalId === pane.terminalId ? "active" : ""
          }`}
          style={{
            position: "absolute",
            top: `${pane.position.top}%`,
            left: `${pane.position.left}%`,
            width: `${pane.position.width}%`,
            height: `${pane.position.height}%`,
          }}
        >
          <Terminal
            key={pane.terminalId}
            id={pane.terminalId}
            active={activeTerminalId === pane.terminalId}
            onFocus={() => onTerminalFocus(pane.terminalId)}
          />
          {index < array.length - 1 && (
            <div
              className="terminal-divider"
              style={{
                position: "absolute",
                ...(pane.position.height === 100
                  ? {
                      // Vertical divider
                      top: 0,
                      bottom: 0,
                      width: "4px",
                      right: "-2px",
                      cursor: "col-resize",
                    }
                  : {
                      // Horizontal divider
                      left: 0,
                      right: 0,
                      height: "4px",
                      bottom: "-2px",
                      cursor: "row-resize",
                    }),
                backgroundColor: "var(--split-divider-color, #32344a)",
                zIndex: 10,
              }}
            />
          )}
        </div>
      )),
    [tab.panes, activeTerminalId, onTerminalFocus]
  );

  return <div className="terminal-container">{renderedPanes}</div>;
};
