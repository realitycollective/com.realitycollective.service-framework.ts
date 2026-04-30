import { BaseService } from "./base-service.js";
import type { EventHandler, IEventService, ServiceActivationContext } from "./contracts.js";

export class BaseEventService<TEventMap extends Record<string, unknown>, TConfig = unknown>
  extends BaseService<TConfig>
  implements IEventService<TEventMap> {
  private readonly listeners = new Map<keyof TEventMap, Set<EventHandler<TEventMap[keyof TEventMap]>>>();

  public constructor(context: ServiceActivationContext<TConfig>) {
    super(context);
  }

  public on<TEventName extends keyof TEventMap>(eventName: TEventName, handler: EventHandler<TEventMap[TEventName]>): () => void {
    const bucket = this.listeners.get(eventName) ?? new Set();
    bucket.add(handler as EventHandler<TEventMap[keyof TEventMap]>);
    this.listeners.set(eventName, bucket);

    return () => {
      this.off(eventName, handler);
    };
  }

  public off<TEventName extends keyof TEventMap>(eventName: TEventName, handler: EventHandler<TEventMap[TEventName]>): void {
    const bucket = this.listeners.get(eventName);

    if (!bucket) {
      return;
    }

    bucket.delete(handler as EventHandler<TEventMap[keyof TEventMap]>);

    if (bucket.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  public once<TEventName extends keyof TEventMap>(eventName: TEventName, handler: EventHandler<TEventMap[TEventName]>): () => void {
    const wrapped: EventHandler<TEventMap[TEventName]> = (payload) => {
      this.off(eventName, wrapped);
      handler(payload);
    };

    return this.on(eventName, wrapped);
  }

  public emit<TEventName extends keyof TEventMap>(eventName: TEventName, payload: TEventMap[TEventName]): void {
    const bucket = this.listeners.get(eventName);

    if (!bucket) {
      return;
    }

    for (const listener of Array.from(bucket)) {
      listener(payload);
    }
  }

  public listenerCount<TEventName extends keyof TEventMap>(eventName: TEventName): number {
    return this.listeners.get(eventName)?.size ?? 0;
  }
}
