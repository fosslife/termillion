import React, {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  ITerminalInitOnlyOptions,
  ITerminalOptions,
  Terminal as XTerm,
} from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { homeDir } from "@tauri-apps/api/path";
import "@xterm/xterm/css/xterm.css";
import { useConfig } from "../../contexts/ConfigContext";

interface TerminalProps {
  id: string;
  active: boolean;
  onFocus: () => void;
}

export const Terminal = forwardRef<
  { focus: () => void; fit: () => void },
  TerminalProps
>(({ id, active, onFocus }, ref) => {
  const { config } = useConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Add ref implementation
  useImperativeHandle(ref, () => ({
    focus: () => {
      xtermRef.current?.focus();
    },
    fit: () => {
      fitAddonRef.current?.fit();
      // Also trigger resize for PTY
      if (xtermRef.current && ptyIdRef.current) {
        invoke("resize_pty", {
          ptyId: ptyIdRef.current,
          rows: xtermRef.current.rows,
          cols: xtermRef.current.cols,
        }).catch(console.error);
      }
    },
  }));

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | null = null;

    console.log(`[Terminal ${id}] Config for initialization:`, config);

    const initialize = async () => {
      console.log(`[Terminal ${id}] Initializing with config:`, config);

      if (!containerRef.current || xtermRef.current) {
        console.log(
          `[Terminal ${id}] Skipping initialization - already initialized or no container`
        );
        return;
      }

      // Log terminal options before creating
      const terminalOptions: ITerminalOptions & ITerminalInitOnlyOptions = {
        cursorBlink: true,
        cursorStyle: "block" as const,
        fontSize: config?.font.size ?? 14,
        fontFamily: config
          ? `${config.font.family}, ${config.font.fallback_family}`
          : "monospace",
        lineHeight: config?.font.line_height ?? 1.2,
        theme: {
          background: config?.theme.background ?? "#1a1b26",
          foreground: config?.theme.foreground ?? "#a9b1d6",
          cursor: config?.theme.cursor ?? "#c0caf5",
        },
        allowProposedApi: true,
        convertEol: true,
      };
      console.log(`[Terminal ${id}] Terminal options:`, terminalOptions);

      const xterm = new XTerm(terminalOptions);

      console.log("[Terminal] Created xterm instance");

      // Add addons before opening terminal
      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon; // Store fitAddon ref
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
  }, [id, config]);

  // Add resize observer that calls fit
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit();
          if (ptyIdRef.current) {
            invoke("resize_pty", {
              ptyId: ptyIdRef.current,
              rows: xtermRef.current.rows,
              cols: xtermRef.current.cols,
            }).catch(console.error);
          }
        }
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

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
});
