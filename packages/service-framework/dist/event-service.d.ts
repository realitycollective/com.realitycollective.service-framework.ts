import { BaseService } from "./base-service.js";
import type { EventHandler, IEventService, ServiceActivationContext } from "./contracts.js";
export declare class BaseEventService<TEventMap extends Record<string, unknown>, TConfig = unknown> extends BaseService<TConfig> implements IEventService<TEventMap> {
    private readonly listeners;
    constructor(context: ServiceActivationContext<TConfig>);
    on<TEventName extends keyof TEventMap>(eventName: TEventName, handler: EventHandler<TEventMap[TEventName]>): () => void;
    off<TEventName extends keyof TEventMap>(eventName: TEventName, handler: EventHandler<TEventMap[TEventName]>): void;
    once<TEventName extends keyof TEventMap>(eventName: TEventName, handler: EventHandler<TEventMap[TEventName]>): () => void;
    emit<TEventName extends keyof TEventMap>(eventName: TEventName, payload: TEventMap[TEventName]): void;
    listenerCount<TEventName extends keyof TEventMap>(eventName: TEventName): number;
}
//# sourceMappingURL=event-service.d.ts.map