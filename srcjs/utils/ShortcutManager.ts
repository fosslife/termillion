import { Config } from "../config";
import { EventBus } from "./EventBus";

export class ShortcutManager {
  private static instance: ShortcutManager;
  private shortcuts: Map<string, () => void> = new Map();
  private config: Config;

  private constructor(config: Config) {
    this.config = config;
    this.initialize();
  }

  public static getInstance(config: Config): ShortcutManager {
    if (!ShortcutManager.instance) {
      ShortcutManager.instance = new ShortcutManager(config);
    }
    return ShortcutManager.instance;
  }

  private initialize(): void {
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const shortcut = this.getShortcutString(event);

    if (this.shortcuts.has(shortcut)) {
      event.preventDefault();
      const action = this.shortcuts.get(shortcut);
      action?.();
    }
  }

  private getShortcutString(event: KeyboardEvent): string {
    const keys = [];
    if (event.ctrlKey) keys.push("Ctrl");
    if (event.shiftKey) keys.push("Shift");
    if (event.altKey) keys.push("Alt");
    if (event.metaKey) keys.push("Meta");
    keys.push(event.key.toUpperCase());
    return keys.join("+");
  }

  public registerShortcut(shortcut: string, action: () => void): void {
    this.shortcuts.set(shortcut, action);
  }

  public unregisterShortcut(shortcut: string): void {
    this.shortcuts.delete(shortcut);
  }

  public getShortcutConfig(key: keyof Config["shortcuts"]): string {
    const shortcut = this.config.shortcuts[key];
    return [
      shortcut.ctrl ? "Ctrl" : "",
      shortcut.shift ? "Shift" : "",
      shortcut.alt ? "Alt" : "",
      shortcut.meta ? "Meta" : "",
      shortcut.key.toUpperCase(),
    ]
      .filter(Boolean)
      .join("+");
  }
}

// Hook-like function for easy shortcut registration
export function useShortcut(shortcut: string, action: () => void): void {
  const shortcutManager = ShortcutManager.getInstance(window.__config);
  shortcutManager.registerShortcut(shortcut, action);
}
