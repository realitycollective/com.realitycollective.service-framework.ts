export class ManualScheduler {
    subscriptions = {
        startup: new Set(),
        tick: new Set(),
        lateTick: new Set(),
        fixedTick: new Set(),
        renderTick: new Set(),
        focusChange: new Set(),
        pauseChange: new Set(),
        dispose: new Set()
    };
    subscribe(channel, handler) {
        const bucket = this.subscriptions[channel];
        bucket.add(handler);
        return () => {
            bucket.delete(handler);
        };
    }
    emit(channel, payload) {
        const bucket = Array.from(this.subscriptions[channel]);
        for (const handler of bucket) {
            handler(payload);
        }
    }
    dispose() {
        this.emit("dispose", undefined);
        for (const bucket of Object.values(this.subscriptions)) {
            bucket.clear();
        }
    }
}
export class TimerScheduler extends ManualScheduler {
    now;
    setIntervalFn;
    clearIntervalFn;
    requestAnimationFrameFn;
    cancelAnimationFrameFn;
    tickIntervalMs;
    fixedIntervalMs;
    tickHandle;
    lateTickHandle;
    fixedHandle;
    renderHandle;
    running = false;
    frame = 0;
    lastTickTimestamp = 0;
    lastFixedTimestamp = 0;
    lastRenderTimestamp = 0;
    constructor(options = {}) {
        super();
        this.tickIntervalMs = options.tickIntervalMs ?? 16;
        this.fixedIntervalMs = options.fixedIntervalMs ?? 50;
        this.now = options.now ?? (() => Date.now());
        this.setIntervalFn = options.setIntervalFn ?? setInterval;
        this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
        this.requestAnimationFrameFn = options.requestAnimationFrameFn;
        this.cancelAnimationFrameFn = options.cancelAnimationFrameFn;
    }
    start() {
        if (this.running) {
            return;
        }
        this.running = true;
        this.emit("startup", undefined);
        this.tickHandle = this.setIntervalFn(() => {
            const current = this.now();
            const context = this.createLifecycleContext(current, current - this.lastTickTimestamp || this.tickIntervalMs, "tick");
            this.lastTickTimestamp = current;
            this.emit("tick", context);
        }, this.tickIntervalMs);
        this.lateTickHandle = this.setIntervalFn(() => {
            const current = this.now();
            const context = this.createLifecycleContext(current, this.tickIntervalMs, "lateTick");
            this.emit("lateTick", context);
        }, this.tickIntervalMs);
        this.fixedHandle = this.setIntervalFn(() => {
            const current = this.now();
            const context = this.createLifecycleContext(current, current - this.lastFixedTimestamp || this.fixedIntervalMs, "fixedTick");
            this.lastFixedTimestamp = current;
            this.emit("fixedTick", context);
        }, this.fixedIntervalMs);
        if (this.requestAnimationFrameFn) {
            const step = (timestamp) => {
                if (!this.running) {
                    return;
                }
                const context = this.createLifecycleContext(timestamp, timestamp - this.lastRenderTimestamp || this.tickIntervalMs, "renderTick");
                this.lastRenderTimestamp = timestamp;
                this.emit("renderTick", context);
                this.renderHandle = this.requestAnimationFrameFn?.(step);
            };
            this.renderHandle = this.requestAnimationFrameFn(step);
        }
    }
    stop() {
        if (!this.running) {
            return;
        }
        this.running = false;
        if (this.tickHandle) {
            this.clearIntervalFn(this.tickHandle);
            this.tickHandle = undefined;
        }
        if (this.lateTickHandle) {
            this.clearIntervalFn(this.lateTickHandle);
            this.lateTickHandle = undefined;
        }
        if (this.fixedHandle) {
            this.clearIntervalFn(this.fixedHandle);
            this.fixedHandle = undefined;
        }
        if (this.renderHandle !== undefined && this.cancelAnimationFrameFn) {
            this.cancelAnimationFrameFn(this.renderHandle);
            this.renderHandle = undefined;
        }
    }
    dispose() {
        this.stop();
        super.dispose();
    }
    createLifecycleContext(timestamp, deltaTime, source) {
        this.frame += 1;
        return {
            timestamp,
            deltaTime,
            frame: this.frame,
            source
        };
    }
}
//# sourceMappingURL=scheduler.js.map