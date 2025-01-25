import { useCallback, useEffect, useRef } from "react";

interface UseSplitResizeProps {
  direction: "horizontal" | "vertical";
  onResize: (ratio: number) => void;
  minRatio?: number;
  maxRatio?: number;
}

// Debug helper
const DEBUG = true;
const log = (...args: any[]) => {
  if (DEBUG) console.log("[SplitResize]", ...args);
};

export const useSplitResize = ({
  direction,
  onResize,
  minRatio = 0.1,
  maxRatio = 0.9,
}: UseSplitResizeProps) => {
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef<number>(0);
  const startRatioRef = useRef<number>(0.5);

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      log("MouseDown attempt", {
        direction,
        clientX: e.clientX,
        clientY: e.clientY,
        target: e.target,
        currentTarget: e.currentTarget,
      });

      isDragging.current = true;
      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        startPosRef.current =
          direction === "horizontal" ? e.clientY : e.clientX;
        // Calculate initial ratio based on current position
        const currentRatio =
          direction === "horizontal"
            ? (e.clientY - rect.top) / rect.height
            : (e.clientX - rect.left) / rect.width;
        startRatioRef.current = currentRatio;

        log("MouseDown success", {
          direction,
          startPos: startPosRef.current,
          startRatio: startRatioRef.current,
          containerRect: rect,
        });
      }

      const divider = dividerRef.current;
      if (divider) {
        divider.classList.add("dragging");
      }
    },
    [direction]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) {
        return;
      }

      log("MouseMove processing", {
        direction,
        clientX: e.clientX,
        clientY: e.clientY,
      });

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();

      const currentPos = direction === "horizontal" ? e.clientY : e.clientX;
      const totalSize = direction === "horizontal" ? rect.height : rect.width;
      const delta = currentPos - startPosRef.current;

      // Calculate new ratio based on delta movement
      const deltaRatio = delta / totalSize;
      let newRatio = startRatioRef.current + deltaRatio;

      // Clamp the ratio
      newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio));

      log("MouseMove", {
        direction,
        currentPos,
        startPos: startPosRef.current,
        delta,
        totalSize,
        deltaRatio,
        newRatio,
        rect,
      });

      onResize(newRatio);
    },
    [direction, onResize, minRatio, maxRatio]
  );

  const handleMouseUp = useCallback(() => {
    log("MouseUp", { wasDragging: isDragging.current });
    isDragging.current = false;
    const divider = dividerRef.current;
    if (divider) {
      divider.classList.remove("dragging");
    }
  }, []);

  useEffect(() => {
    const divider = dividerRef.current;
    if (!divider) return;

    log("Setting up event listeners");
    divider.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      log("Cleaning up event listeners");
      divider.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);

  return { containerRef, dividerRef };
};
