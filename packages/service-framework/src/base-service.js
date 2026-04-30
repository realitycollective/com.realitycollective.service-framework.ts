export class BaseService {
    modules = [];
    registered = false;
    initialized = false;
    started = false;
    destroyed = false;
    manager;
    scheduler;
    environment;
    abortSignal;
    constructor(context) {
        this.serviceName = context.name;
        this.servicePriority = context.priority;
        this.serviceConfig = context.config;
        this.manager = context.manager;
        this.scheduler = context.scheduler;
        this.environment = context.environment;
        this.abortSignal = context.signal;
    }
    serviceName;
    servicePriority;
    serviceConfig;
    get isEnabled() {
        return !this.isDestroyed;
    }
    get isInitialized() {
        return this.initialized;
    }
    get isStarted() {
        return this.started;
    }
    get isDestroyed() {
        return this.destroyed;
    }
    get isServiceRegistered() {
        return this.registered;
    }
    get serviceModules() {
        return this.modules;
    }
    initialize() { }
    start() { }
    reset() { }
    update(_context) { }
    lateUpdate(_context) { }
    fixedUpdate(_context) { }
    render(_context) { }
    destroy() { }
    onFocusChange(_context) { }
    onPauseChange(_context) { }
    registerServiceModule(serviceModule) {
        if (!this.modules.includes(serviceModule)) {
            this.modules.push(serviceModule);
        }
    }
    unregisterServiceModule(serviceModule) {
        const moduleIndex = this.modules.indexOf(serviceModule);
        if (moduleIndex >= 0) {
            this.modules.splice(moduleIndex, 1);
        }
    }
    Initialize() {
        this.initialize();
    }
    Start() {
        this.start();
    }
    Reset() {
        this.reset();
    }
    Update(context) {
        this.update(context);
    }
    LateUpdate(context) {
        this.lateUpdate(context);
    }
    FixedUpdate(context) {
        this.fixedUpdate(context);
    }
    Render(context) {
        this.render(context);
    }
    Destroy() {
        this.destroy();
    }
    OnFocusChange(context) {
        this.onFocusChange(context);
    }
    OnPauseChange(context) {
        this.onPauseChange(context);
    }
    _setRegistrationState(isRegistered) {
        this.registered = isRegistered;
    }
    _setInitializedState(isInitialized) {
        this.initialized = isInitialized;
    }
    _setStartedState(isStarted) {
        this.started = isStarted;
    }
    _setDestroyedState(isDestroyed) {
        this.destroyed = isDestroyed;
    }
}
export class BaseServiceModule extends BaseService {
    parentService;
    constructor(context) {
        super(context);
        if (!context.parent) {
            throw new Error(`Service module "${context.name}" requires a parent service.`);
        }
        this.parentService = context.parent;
        this.parentService.registerServiceModule(this);
    }
}
//# sourceMappingURL=base-service.js.map