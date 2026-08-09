type Listener = (...args: any[]) => void;

export class EventEmitter {
  private _events: Map<string, Listener[]> = new Map();

  on(event: string, fn: Listener): this {
    if (!this._events.has(event)) this._events.set(event, []);
    this._events.get(event)!.push(fn);
    return this;
  }

  off(event: string, fn: Listener): this {
    const listeners = this._events.get(event);
    if (listeners) {
      this._events.set(event, listeners.filter(l => l !== fn));
    }
    return this;
  }

  emit(event: string, ...args: any[]): this {
    this._events.get(event)?.forEach(fn => fn(...args));
    return this;
  }

  once(event: string, fn: Listener): this {
    const wrapper = (...args: any[]) => { fn(...args); this.off(event, wrapper); };
    return this.on(event, wrapper);
  }
}
