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

// Debug helper
const DEBUG = true;
const log = (...args: any[]) => {
  if (DEBUG) console.log("[Terminal]", ...args);
};

interface TerminalProps {
  id: string;
}

const Terminal: React.FC<TerminalProps> = ({ id }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const [padding, setPadding] = useState({ x: 12, y: 8 }); // Default padding

  useEffect(() => {
    log("Terminal component mounted with id:", id);

    const initializeTerminal = async () => {
      if (!terminalRef.current) {
        log("Error: No terminal container ref");
        return;
      }

      if (xtermRef.current) {
        log("Warning: Terminal already initialized");
        return;
      }

      log("Initializing new terminal instance");

      try {
        const config = await invoke<Config>("get_config");

        // Check and load font
        let fontFamily = config.font.family;
        const isPrimaryFontAvailable = await isFontAvailable(fontFamily);

        if (!isPrimaryFontAvailable) {
          log(`Primary font ${fontFamily} not available, trying fallback`);
          fontFamily = config.font.fallback_family;

          if (!(await isFontAvailable(fontFamily))) {
            await loadGoogleFont(fontFamily);
          }
        }

        const xterm = new XTerm({
          theme: {
            background: config.theme.background,
            foreground: config.theme.foreground,
            cursor: config.theme.cursor,
            selectionBackground: config.theme.selection,
            // ANSI colors
            black: config.theme.black,
            red: config.theme.red,
            green: config.theme.green,
            yellow: config.theme.yellow,
            blue: config.theme.blue,
            magenta: config.theme.magenta,
            cyan: config.theme.cyan,
            white: config.theme.white,
            // Bright variants
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
          scrollback:
            config.terminal.scrollback === "infinite"
              ? Infinity
              : config.terminal.scrollback,
          cursorBlink: true,
          cursorStyle: "block",
          cursorWidth: 1,
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();

        xterm.loadAddon(fitAddon);
        xterm.loadAddon(webLinksAddon);

        xtermRef.current = xterm;
        fitAddonRef.current = fitAddon;

        log("Opening terminal in container");
        xterm.open(terminalRef.current);

        try {
          const webglAddon = new WebglAddon();
          xterm.loadAddon(webglAddon);
        } catch (e) {
          log("WebGL addon failed to load:", e);
        }

        fitAddon.fit();
        log("Initial fit complete");

        try {
          const cwd = await homeDir();
          log("Creating PTY with cwd:", cwd);

          const ptyId = (await invoke("create_pty", {
            cwd,
            rows: xterm.rows,
            cols: xterm.cols,
          })) as string;

          ptyIdRef.current = ptyId;
          log("PTY created with id:", ptyId);

          const unlisten = await getCurrentWindow().listen(
            `pty://output/${ptyId}`,
            (event: any) => {
              xterm.write(event.payload);
            }
          );

          xterm.onData((data) => {
            invoke("write_pty", {
              ptyId,
              data,
            });
          });

          const handleResize = () => {
            if (fitAddonRef.current) {
              fitAddonRef.current.fit();
              invoke("resize_pty", {
                ptyId,
                rows: xterm.rows,
                cols: xterm.cols,
              });
            }
          };

          window.addEventListener("resize", handleResize);
          log("Terminal setup complete");

          return () => {
            log("Cleaning up terminal:", id);
            unlisten();
            window.removeEventListener("resize", handleResize);
            xterm.dispose();
            if (ptyId) {
              invoke("destroy_pty", { ptyId });
            }
          };
        } catch (error) {
          log("Failed to initialize terminal:", error);
        }
      } catch (error) {
        log("Failed to initialize terminal:", error);
      }
    };

    initializeTerminal();
  }, [id]);

  useEffect(() => {
    // Load config when component mounts
    const loadConfig = async () => {
      try {
        const config = await invoke<Config>("get_config");
        if (config.terminal?.padding) {
          setPadding(config.terminal.padding);
        }
      } catch (error) {
        log("Failed to load config:", error);
      }
    };

    loadConfig();
  }, []);

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
