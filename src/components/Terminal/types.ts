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

// Add discriminated unions for better type checking
export type SplitDirection = "horizontal" | "vertical";

export type PaneContent =
  | { type: "pane"; id: string; terminalId: string }
  | {
      type: "split";
      direction: SplitDirection;
      ratio: number;
      first: PaneContent;
      second: PaneContent;
    };
