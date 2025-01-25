import React, { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { homeDir } from "@tauri-apps/api/path";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  id: string;
  active: boolean;
  onFocus: () => void;
}

export const Terminal: React.FC<TerminalProps> = ({ id, active, onFocus }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | null = null;

    const initialize = async () => {
      console.log("[Terminal] Initializing...", {
        id,
        containerRef: !!containerRef.current,
      });
      if (!containerRef.current || xtermRef.current) return;

      // Create terminal with proper options
      const xterm = new XTerm({
        cursorBlink: true,
        cursorStyle: "block",
        fontSize: 14,
        fontFamily: "monospace",
        theme: {
          background: getComputedStyle(document.documentElement)
            .getPropertyValue("--terminal-bg")
            .trim(),
          foreground: getComputedStyle(document.documentElement)
            .getPropertyValue("--terminal-fg")
            .trim(),
        },
        allowProposedApi: true,
        rows: 24,
        cols: 80,
      });

      console.log("[Terminal] Created xterm instance");

      // Add addons before opening terminal
      const fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);
      xterm.loadAddon(new WebLinksAddon());

      if (!mounted) return;

      // Store refs
      xtermRef.current = xterm;
      fitAddonRef.current = fitAddon;

      // Open terminal in container
      console.log("[Terminal] Opening in container");
      xterm.open(containerRef.current);

      // Try WebGL addon
      try {
        xterm.loadAddon(new WebglAddon());
      } catch (e) {
        console.warn("WebGL addon failed to load:", e);
      }

      // Wait for next frame to ensure terminal is rendered
      await new Promise((resolve) => requestAnimationFrame(resolve));

      console.log("[Terminal] Fitting terminal");
      fitAddon.fit();

      // Create PTY with current dimensions
      console.log("[Terminal] Creating PTY");
      const cwd = await homeDir();
      const ptyId = await invoke<string>("create_pty", {
        cwd,
        rows: xterm.rows,
        cols: xterm.cols,
      });

      console.log("[Terminal] PTY created:", ptyId);

      if (!mounted) return;

      ptyIdRef.current = ptyId;

      // Set up event listeners
      const unlistenOutput = await getCurrentWindow().listen(
        `pty://output/${ptyId}`,
        (event: any) => {
          console.log("[Terminal] Received output:", event.payload);
          xterm?.write(event.payload);
        }
      );

      // Handle input
      xterm.onData((data) => {
        if (ptyIdRef.current) {
          invoke("write_pty", {
            ptyId: ptyIdRef.current,
            data,
          }).catch(console.error);
        }
      });

      // Handle resize with debounce
      let resizeTimeout: NodeJS.Timeout;
      const handleResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          if (fitAddon && xterm && ptyId) {
            try {
              fitAddon.fit();
              invoke("resize_pty", {
                ptyId,
                rows: xterm.rows,
                cols: xterm.cols,
              }).catch(console.error);
            } catch (e) {
              console.error("Resize failed:", e);
            }
          }
        }, 100);
      };

      window.addEventListener("resize", handleResize);

      // Set up cleanup
      cleanup = () => {
        clearTimeout(resizeTimeout);
        unlistenOutput();
        window.removeEventListener("resize", handleResize);
      };

      // Initial focus if active
      if (active) {
        xterm.focus();
      }
    };

    initialize().catch(console.error);

    return () => {
      mounted = false;
      if (cleanup) cleanup();

      if (ptyIdRef.current) {
        invoke("destroy_pty", { ptyId: ptyIdRef.current }).catch(console.error);
        ptyIdRef.current = null;
      }

      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
    };
  }, [id]);

  // Separate effect for handling active state
  useEffect(() => {
    if (xtermRef.current) {
      if (active) {
        xtermRef.current.focus();
      }
    }
  }, [active]);

  // Handle container clicks for focus
  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault(); // Prevent any default handling
      e.stopPropagation(); // Stop event bubbling
      onFocus(); // Call focus handler
      if (xtermRef.current) {
        xtermRef.current.focus();
      }
    },
    [onFocus]
  );

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      data-terminal-id={id}
      style={{ width: "100%", height: "100%" }}
      onClick={handleContainerClick} // Add click handler
    />
  );
};
