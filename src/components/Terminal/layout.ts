import { TerminalPane, TabLayout } from "./types";

interface LayoutResult {
  panes: TerminalPane[];
}

export function calculateNewLayout(
  tab: TabLayout,
  sourceId: string,
  newId: string,
  direction: "horizontal" | "vertical"
): LayoutResult {
  const sourcePaneIndex = tab.panes.findIndex((p) => p.terminalId === sourceId);
  const sourcePane = tab.panes[sourcePaneIndex];
  const newPanes = [...tab.panes];

  // For first split
  if (tab.panes.length === 1) {
    if (direction === "horizontal") {
      // Split horizontally (top/bottom)
      newPanes[sourcePaneIndex] = {
        ...sourcePane,
        position: { top: 0, left: 0, width: 100, height: 50 },
      };
      newPanes.push({
        id: `pane-${newId}`,
        terminalId: newId,
        position: { top: 50, left: 0, width: 100, height: 50 },
      });
    } else {
      // Split vertically (left/right)
      newPanes[sourcePaneIndex] = {
        ...sourcePane,
        position: { top: 0, left: 0, width: 50, height: 100 },
      };
      newPanes.push({
        id: `pane-${newId}`,
        terminalId: newId,
        position: { top: 0, left: 50, width: 50, height: 100 },
      });
    }
    return { panes: newPanes };
  }

  // For subsequent splits
  const { top, left, width, height } = sourcePane.position;

  if (direction === "horizontal") {
    // Split the height
    const newHeight = height / 2;
    newPanes[sourcePaneIndex] = {
      ...sourcePane,
      position: { ...sourcePane.position, height: newHeight },
    };
    newPanes.push({
      id: `pane-${newId}`,
      terminalId: newId,
      position: {
        top: top + newHeight,
        left,
        width,
        height: newHeight,
      },
    });
  } else {
    // Split the width
    const newWidth = width / 2;
    newPanes[sourcePaneIndex] = {
      ...sourcePane,
      position: { ...sourcePane.position, width: newWidth },
    };
    newPanes.push({
      id: `pane-${newId}`,
      terminalId: newId,
      position: {
        top,
        left: left + newWidth,
        width: newWidth,
        height,
      },
    });
  }

  return { panes: newPanes };
}

// Helper functions
function parseGridArea(area: string): number[] {
  return area.split(" / ").map(Number);
}
