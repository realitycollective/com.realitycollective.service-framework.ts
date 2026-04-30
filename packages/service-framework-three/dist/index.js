export class ThreeRenderLoopBridge {
    options;
    animationLoopBound = false;
    frame = 0;
    lastTimestamp = 0;
    constructor(options) {
        this.options = options;
    }
    start() {
        if (this.animationLoopBound) {
            return;
        }
        this.animationLoopBound = true;
        this.options.host.setAnimationLoop((timestamp) => {
            const context = {
                timestamp,
                deltaTime: this.lastTimestamp === 0 ? 16 : timestamp - this.lastTimestamp,
                frame: ++this.frame,
                source: "three"
            };
            this.lastTimestamp = timestamp;
            this.options.scheduler.emit("renderTick", context);
        });
    }
    stop() {
        if (!this.animationLoopBound) {
            return;
        }
        this.animationLoopBound = false;
        this.options.host.setAnimationLoop(null);
    }
    dispose() {
        this.stop();
    }
}
//# sourceMappingURL=index.js.map