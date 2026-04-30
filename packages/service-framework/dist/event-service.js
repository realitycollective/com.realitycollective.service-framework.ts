import { BaseService } from "./base-service.js";
export class BaseEventService extends BaseService {
    listeners = new Map();
    constructor(context) {
        super(context);
    }
    on(eventName, handler) {
        const bucket = this.listeners.get(eventName) ?? new Set();
        bucket.add(handler);
        this.listeners.set(eventName, bucket);
        return () => {
            this.off(eventName, handler);
        };
    }
    off(eventName, handler) {
        const bucket = this.listeners.get(eventName);
        if (!bucket) {
            return;
        }
        bucket.delete(handler);
        if (bucket.size === 0) {
            this.listeners.delete(eventName);
        }
    }
    once(eventName, handler) {
        const wrapped = (payload) => {
            this.off(eventName, wrapped);
            handler(payload);
        };
        return this.on(eventName, wrapped);
    }
    emit(eventName, payload) {
        const bucket = this.listeners.get(eventName);
        if (!bucket) {
            return;
        }
        for (const listener of Array.from(bucket)) {
            listener(payload);
        }
    }
    listenerCount(eventName) {
        return this.listeners.get(eventName)?.size ?? 0;
    }
}
//# sourceMappingURL=event-service.js.map