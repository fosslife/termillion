import { v4 as uuidv4 } from "uuid";
import { TabLayout, Terminal, TerminalPane } from "./types";

export function createInitialTab(index: number = 1): TabLayout {
  const terminalId = `terminal-${uuidv4()}`;
  const paneId = `pane-${uuidv4()}`;

  const terminal: Terminal = {
    id: terminalId,
    ptyId: null,
  };

  const pane: TerminalPane = {
    id: paneId,
    terminalId: terminalId,
    position: {
      top: 0,
      left: 0,
      width: 100,
      height: 100,
    },
  };

  return {
    id: `tab-${uuidv4()}`,
    name: `Terminal ${index}`,
    terminals: [terminal],
    panes: [pane],
    gridTemplate: "1fr / 1fr",
  };
}
