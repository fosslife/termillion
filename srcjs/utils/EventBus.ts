export class EventBus {
  private static instance: EventBus;
  private listeners: Map<string, Function[]> = new Map();

  public static PROFILE_CHANGED = "profileChanged";
  public static PROFILE_ADDED = "profileAdded";
  public static PROFILE_REMOVED = "profileRemoved";

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  public emit(event: string, ...args: any[]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(...args));
    }
  }
}
