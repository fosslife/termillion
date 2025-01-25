export interface Terminal {
  id: string;
  ptyId: string | null;
}

interface PanePosition {
  top: number; // percentage
  left: number; // percentage
  width: number; // percentage
  height: number; // percentage
}

export interface TerminalPane {
  id: string;
  terminalId: string;
  position: PanePosition;
}

export interface TabLayout {
  id: string;
  name: string;
  terminals: Terminal[];
  panes: TerminalPane[];
  gridTemplate: string;
}
