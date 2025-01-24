import { useCallback, useEffect, useRef } from "react";

interface UseSplitResizeProps {
  direction: "horizontal" | "vertical";
  onResize: (ratio: number) => void;
  minRatio?: number;
  maxRatio?: number;
}

export const useSplitResize = ({
  direction,
  onResize,
  minRatio = 0.1,
  maxRatio = 0.9,
}: UseSplitResizeProps) => {
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    isDragging.current = true;
    e.preventDefault();

    const divider = dividerRef.current;
    if (divider) {
      divider.classList.add("dragging");
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    const divider = dividerRef.current;
    if (divider) {
      divider.classList.remove("dragging");
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();

      let ratio;
      if (direction === "horizontal") {
        ratio = (e.clientY - rect.top) / rect.height;
      } else {
        ratio = (e.clientX - rect.left) / rect.width;
      }

      // Clamp ratio between min and max
      ratio = Math.max(minRatio, Math.min(maxRatio, ratio));
      onResize(ratio);
    },
    [direction, onResize, minRatio, maxRatio]
  );

  useEffect(() => {
    const divider = dividerRef.current;
    if (!divider) return;

    divider.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      divider.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);

  return { containerRef, dividerRef };
};
