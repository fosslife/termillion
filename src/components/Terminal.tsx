import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { homeDir } from "@tauri-apps/api/path";
import "@xterm/xterm/css/xterm.css";
import { isFontAvailable, loadGoogleFont } from "../font-checker";
import { Config } from "../config";
import { Model, Actions } from "flexlayout-react";

// Debug helper
const DEBUG = true;
const log = (...args: any[]) => {
  if (DEBUG) console.log("[Terminal]", ...args);
};

interface TerminalProps {
  id: string;
  model: Model;
}

const Terminal: React.FC<TerminalProps> = ({ id, model }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const [padding, setPadding] = useState({ x: 12, y: 8 });

  // Single useEffect for terminal lifecycle
  useEffect(() => {
    let mounted = true;
    let xterm: XTerm | null = null;
    let fitAddon: FitAddon | null = null;
    let unlistenOutput: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    const initialize = async () => {
      if (!terminalRef.current || xtermRef.current) return;

      try {
        const config = await invoke<Config>("get_config");

        // Font handling
        let fontFamily = config.font.family;
        if (!(await isFontAvailable(fontFamily))) {
          fontFamily = config.font.fallback_family;
          if (!(await isFontAvailable(fontFamily))) {
            await loadGoogleFont(fontFamily);
          }
        }

        // Create terminal
        xterm = new XTerm({
          theme: {
            background: config.theme.background,
            foreground: config.theme.foreground,
            cursor: config.theme.cursor,
            selectionBackground: config.theme.selection,
            // ANSI colors...
            black: config.theme.black,
            red: config.theme.red,
            green: config.theme.green,
            yellow: config.theme.yellow,
            blue: config.theme.blue,
            magenta: config.theme.magenta,
            cyan: config.theme.cyan,
            white: config.theme.white,
            // Bright variants...
            brightBlack: config.theme.bright_black,
            brightRed: config.theme.bright_red,
            brightGreen: config.theme.bright_green,
            brightYellow: config.theme.bright_yellow,
            brightBlue: config.theme.bright_blue,
            brightMagenta: config.theme.bright_magenta,
            brightCyan: config.theme.bright_cyan,
            brightWhite: config.theme.bright_white,
          },
          fontFamily: `${fontFamily}, ${config.font.fallback_family}`,
          fontSize: config.font.size,
          lineHeight: 1,
          letterSpacing: 0,
          cursorBlink: true,
          cursorStyle: "block",
          cursorWidth: 1,
        });

        // Add addons
        fitAddon = new FitAddon();
        xterm.loadAddon(fitAddon);
        xterm.loadAddon(new WebLinksAddon());

        if (!mounted) return;

        // Store refs
        xtermRef.current = xterm;
        fitAddonRef.current = fitAddon;

        // Open terminal
        xterm.open(terminalRef.current);

        try {
          xterm.loadAddon(new WebglAddon());
        } catch (e) {
          log("WebGL addon failed to load:", e);
        }

        fitAddon.fit();

        // Create PTY
        const cwd = await homeDir();
        const ptyId = await invoke<string>("create_pty", {
          cwd,
          rows: xterm.rows,
          cols: xterm.cols,
        });

        if (!mounted) return;

        ptyIdRef.current = ptyId;

        // Listen for PTY exit
        const listenExit = await getCurrentWindow().listen(
          `pty://exit/${ptyId}`,
          async () => {
            // Close the tab when PTY exits
            const node = model.getNodeById(id);
            if (node) {
              model.doAction(Actions.deleteTab(id));
            }
          }
        );
        unlistenExit = listenExit;

        // Listen for PTY output
        const listenOutput = await getCurrentWindow().listen(
          `pty://output/${ptyId}`,
          (event: any) => {
            xterm?.write(event.payload);
          }
        );
        unlistenOutput = listenOutput;

        // Set up data handlers
        xterm.onData((data) => {
          if (ptyIdRef.current) {
            invoke("write_pty", {
              ptyId: ptyIdRef.current,
              data,
            }).catch((e) => log("Write error:", e));
          }
        });

        // Handle resize
        const handleResize = () => {
          if (fitAddon && xterm && ptyId) {
            fitAddon.fit();
            invoke("resize_pty", {
              ptyId,
              rows: xterm.rows,
              cols: xterm.cols,
            });
          }
        };

        window.addEventListener("resize", handleResize);

        if (config.terminal?.padding) {
          setPadding(config.terminal.padding);
        }
      } catch (error) {
        log("Terminal initialization failed:", error);
      }
    };

    initialize();

    // Cleanup
    return () => {
      mounted = false;

      if (unlistenOutput) {
        unlistenOutput();
      }
      if (unlistenExit) {
        unlistenExit();
      }

      if (ptyIdRef.current) {
        invoke("destroy_pty", { ptyId: ptyIdRef.current }).catch((e) =>
          log("PTY cleanup error:", e)
        );
        ptyIdRef.current = null;
      }

      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }

      window.removeEventListener("resize", () => {});
    };
  }, [id, model]);

  return (
    <div
      ref={terminalRef}
      className="terminal-container"
      data-terminal-id={id}
      style={{
        paddingLeft: padding.x,
        paddingRight: padding.x,
        paddingTop: padding.y,
        paddingBottom: padding.y,
      }}
    />
  );
};

export default Terminal;
