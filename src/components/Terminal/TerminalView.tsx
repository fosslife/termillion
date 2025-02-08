import React from "react";
import { Terminal } from "./Terminal";
import "./TerminalView.css";
import { TabLayout } from "./types";

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
  console.log("[TerminalView] Rendering", {
    tab,
    activeTerminalId,
    panes: tab.panes,
    gridTemplate: tab.gridTemplate,
  });

  // Use memo to prevent unnecessary re-renders
  const renderedPanes = React.useMemo(
    () =>
      tab.panes.map((pane) => (
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
        </div>
      )),
    [tab.panes, activeTerminalId, onTerminalFocus]
  );

  return <div className="terminal-container">{renderedPanes}</div>;
};
