import React, { useEffect, useRef, useCallback, forwardRef } from "react";
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

export const Terminal = forwardRef<{ focus: () => void }, TerminalProps>(
  ({ id, active, onFocus }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const ptyIdRef = useRef<string | null>(null);

    useEffect(() => {
      let mounted = true;
      let cleanup: (() => void) | null = null;

      console.log(`[Terminal ${id}] Effect starting, mounted:`, mounted);

      const initialize = async () => {
        console.log(`[Terminal ${id}] Initializing...`, {
          id,
          containerRef: !!containerRef.current,
          xtermRef: !!xtermRef.current,
          ptyIdRef: ptyIdRef.current,
        });

        if (!containerRef.current || xtermRef.current) {
          console.log(
            `[Terminal ${id}] Skipping initialization - already initialized or no container`
          );
          return;
        }

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
          convertEol: true,
        });

        console.log("[Terminal] Created xterm instance");

        // Add addons before opening terminal
        const fitAddon = new FitAddon();
        xterm.loadAddon(fitAddon);
        xterm.loadAddon(new WebLinksAddon());

        if (!mounted) {
          xterm.dispose();
          return;
        }

        xtermRef.current = xterm;
        console.log("[Terminal] Opening in container");
        xterm.open(containerRef.current);

        // Try WebGL addon
        try {
          xterm.loadAddon(new WebglAddon());
        } catch (e) {
          console.warn("WebGL addon failed to load:", e);
        }

        await new Promise((resolve) => requestAnimationFrame(resolve));
        console.log(`[Terminal] Fitting terminal with id ${id}`);
        fitAddon.fit();

        // Create PTY
        console.log(`[Terminal ${id}] Creating PTY`);
        const cwd = await homeDir();
        const ptyId = await invoke<string>("create_pty", {
          cwd,
          rows: xterm.rows,
          cols: xterm.cols,
        });

        if (!mounted) {
          console.log(`[Terminal ${id}] Cleaning up PTY after unmount:`, ptyId);
          await invoke("destroy_pty", { ptyId });
          return;
        }

        console.log(`[Terminal ${id}] PTY created:`, ptyId);
        ptyIdRef.current = ptyId;

        // Set up event listeners and handlers
        const unlistenOutput = await getCurrentWindow().listen(
          `pty://output/${ptyId}`,
          (event: any) => {
            xterm?.write(event.payload);
          }
        );

        xterm.onData((data) => {
          if (ptyIdRef.current) {
            invoke("write_pty", {
              ptyId: ptyIdRef.current,
              data,
            }).catch(console.error);
          }
        });

        // Handle resize with debounce
        let resizeTimeout: number;
        const handleResize = () => {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            if (fitAddon && xterm && ptyIdRef.current) {
              try {
                fitAddon.fit();
                invoke("resize_pty", {
                  ptyId: ptyIdRef.current,
                  rows: xterm.rows,
                  cols: xterm.cols,
                }).catch(console.error);
              } catch (e) {
                console.error("Resize failed:", e);
              }
            }
          }, 100);
        };

        const resizeObserver = new ResizeObserver((entries) => {
          requestAnimationFrame(() => {
            if (!entries[0]) return;
            handleResize();
          });
        });

        cleanup = () => {
          clearTimeout(resizeTimeout);
          unlistenOutput();
          resizeObserver.disconnect();
        };

        if (active) {
          xterm.focus();
        }
      };

      initialize().catch(console.error);

      return () => {
        console.log(`[Terminal ${id}] Cleanup starting, mounted:`, mounted);
        mounted = false;

        if (cleanup) {
          console.log(`[Terminal ${id}] Running cleanup handlers`);
          cleanup();
        }

        if (ptyIdRef.current) {
          console.log(`[Terminal ${id}] Destroying PTY:`, ptyIdRef.current);
          const ptyId = ptyIdRef.current;
          ptyIdRef.current = null;
          invoke("destroy_pty", { ptyId }).catch(console.error);
        }

        if (xtermRef.current) {
          console.log(`[Terminal ${id}] Disposing xterm instance`);
          xtermRef.current.dispose();
          xtermRef.current = null;
        }
      };
    }, [id]);

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
  }
);
