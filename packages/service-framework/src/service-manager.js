import { BaseService } from "./base-service.js";
import { createEnvironmentDescriptor } from "./environment.js";
import { ManualScheduler } from "./scheduler.js";
export class ServiceManager {
    recordsByToken = new Map();
    schedulerSubscriptions = [];
    waiters = new Map();
    profileName = "runtime";
    initialized = false;
    started = false;
    disposed = false;
    initializationWaiters = [];
    scheduler;
    environment;
    constructor(options = {}) {
        this.scheduler = options.scheduler ?? new ManualScheduler();
        this.environment = options.environment ?? createEnvironmentDescriptor("default");
        this.schedulerSubscriptions.push(this.scheduler.subscribe("startup", () => {
            this.start();
        }), this.scheduler.subscribe("tick", (context) => {
            this.forEachRecord((record) => {
                record.instance.update(context);
            });
        }), this.scheduler.subscribe("lateTick", (context) => {
            this.forEachRecord((record) => {
                record.instance.lateUpdate(context);
            });
        }), this.scheduler.subscribe("fixedTick", (context) => {
            this.forEachRecord((record) => {
                record.instance.fixedUpdate(context);
            });
        }), this.scheduler.subscribe("renderTick", (context) => {
            this.forEachRecord((record) => {
                record.instance.render(context);
            });
        }), this.scheduler.subscribe("focusChange", (context) => {
            this.forEachRecord((record) => {
                record.instance.onFocusChange(context);
            });
        }), this.scheduler.subscribe("pauseChange", (context) => {
            this.forEachRecord((record) => {
                record.instance.onPauseChange(context);
            });
        }), this.scheduler.subscribe("dispose", () => {
            this.dispose();
        }));
    }
    get isInitialized() {
        return this.initialized;
    }
    get isStarted() {
        return this.started;
    }
    initializeProfile(profile) {
        this.throwIfDisposed();
        if (this.initialized) {
            throw new Error("ServiceManager has already been initialized.");
        }
        this.profileName = profile.name;
        for (const registration of this.sortRegistrations(profile.services)) {
            const [record] = this.activateRegistrations([registration]);
            if (!record) {
                continue;
            }
            this.walkRecordTree(record, (activeRecord) => {
                this.initializeRecord(activeRecord);
            });
        }
        this.initialized = true;
        this.flushInitializationWaiters();
    }
    register(registration) {
        this.throwIfDisposed();
        const [record] = this.activateRegistrations([registration]);
        if (!record) {
            throw new Error(`Registration "${registration.name ?? registration.token.description}" was filtered out by environment rules.`);
        }
        this.walkRecordTree(record, (activeRecord) => {
            this.initializeRecord(activeRecord);
        });
        if (this.started) {
            this.walkRecordTree(record, (activeRecord) => {
                this.startRecord(activeRecord);
            });
        }
        return record.instance;
    }
    unregister(token, name) {
        const record = this.findRecord(token, name);
        if (!record) {
            return false;
        }
        this.disposeRecord(record);
        return true;
    }
    resolve(token, name) {
        const service = this.tryResolve(token, name);
        if (!service) {
            throw new Error(`Unable to resolve service "${name ?? token.description}".`);
        }
        return service;
    }
    tryResolve(token, name) {
        const records = this.recordsByToken.get(token.id) ?? [];
        const match = name
            ? records.find((record) => record.name === name)
            : records[0];
        return match?.instance;
    }
    resolveAll(token) {
        return (this.recordsByToken.get(token.id) ?? []).map((record) => record.instance);
    }
    async resolveAsync(token, timeoutMs = 1000, name) {
        const existing = this.tryResolve(token, name);
        if (existing) {
            return existing;
        }
        return await new Promise((resolve, reject) => {
            let waiter;
            const timeoutHandle = setTimeout(() => {
                this.removeWaiter(token.id, waiter);
                reject(new Error(`Timed out waiting for service "${name ?? token.description}".`));
            }, timeoutMs);
            waiter = {
                name,
                resolve,
                reject,
                timeoutHandle
            };
            const bucket = this.waiters.get(token.id) ?? [];
            bucket.push(waiter);
            this.waiters.set(token.id, bucket);
        });
    }
    async waitUntilInitialized(timeoutMs = 1000) {
        if (this.initialized) {
            return;
        }
        await new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                this.initializationWaiters = this.initializationWaiters.filter((entry) => entry.timeoutHandle !== timeoutHandle);
                reject(new Error(`Timed out waiting for profile "${this.profileName}" to initialize.`));
            }, timeoutMs);
            this.initializationWaiters.push({
                resolve,
                reject,
                timeoutHandle
            });
        });
    }
    start() {
        if (!this.initialized || this.started) {
            return;
        }
        this.started = true;
        this.forEachRecord((record) => {
            this.startRecord(record);
        });
    }
    reset() {
        this.forEachRecord((record) => {
            record.instance.reset();
        });
    }
    emitPauseChange(context) {
        this.scheduler.emit("pauseChange", context);
    }
    emitFocusChange(focused) {
        this.scheduler.emit("focusChange", { focused });
    }
    getDiagnostics() {
        return {
            initialized: this.initialized,
            started: this.started,
            services: this.getAllRecords().map((record) => this.toSnapshot(record))
        };
    }
    getDependencyGraph() {
        return this.getAllRecords().map((record) => ({
            name: record.name,
            token: record.token.description,
            dependencies: record.dependencies.map((dependency) => dependency.description),
            modules: record.modules.map((module) => module.name)
        }));
    }
    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const record of [...this.getAllRecords()].reverse()) {
            this.disposeRecord(record);
        }
        for (const unsubscribe of this.schedulerSubscriptions.splice(0)) {
            unsubscribe();
        }
        this.scheduler.dispose();
    }
    activateRegistrations(registrations, parent) {
        const activeRecords = [];
        for (const registration of registrations) {
            if (!this.shouldActivate(registration)) {
                continue;
            }
            const record = this.createRecord(registration, parent);
            activeRecords.push(record);
            this.addRecord(record);
            this.notifyWaiters(record);
        }
        for (const record of activeRecords) {
            const modules = this.activateRegistrations(this.sortRegistrations(record.registration.modules ?? []), record);
            for (const moduleRecord of modules) {
                record.modules.push(moduleRecord);
            }
        }
        return activeRecords;
    }
    shouldActivate(registration) {
        if (registration.requiredCapabilities?.some((capability) => !this.environment.hasCapability(capability))) {
            return false;
        }
        return registration.enabledWhen ? registration.enabledWhen(this.environment) : true;
    }
    sortRegistrations(registrations) {
        const byToken = new Map(registrations.map((registration) => [registration.token.id, registration]));
        const visited = new Set();
        const visiting = new Set();
        const visit = (registration) => {
            if (visited.has(registration)) {
                return;
            }
            if (visiting.has(registration)) {
                throw new Error(`Circular dependency detected while ordering "${registration.token.description}".`);
            }
            visiting.add(registration);
            for (const dependency of registration.dependencies ?? []) {
                const dependencyRegistration = byToken.get(dependency.id);
                if (dependencyRegistration) {
                    visit(dependencyRegistration);
                }
            }
            visiting.delete(registration);
            visited.add(registration);
        };
        for (const registration of registrations) {
            visit(registration);
        }
        return [...registrations].sort((left, right) => (left.priority ?? 10) - (right.priority ?? 10));
    }
    createRecord(registration, parent) {
        const name = registration.name ?? registration.token.description;
        const priority = registration.priority ?? 10;
        if (this.findRecord(registration.token, name)) {
            throw new Error(`A service named "${name}" is already registered for token "${registration.token.description}".`);
        }
        const dependencies = registration.dependencies ?? [];
        const dependencyInstances = dependencies.map((dependency) => this.resolve(dependency));
        const abortController = new AbortController();
        const context = {
            name,
            priority,
            config: registration.config,
            manager: this,
            scheduler: this.scheduler,
            environment: this.environment,
            signal: abortController.signal,
            ...(parent ? { parent: parent.instance } : {})
        };
        const instance = registration.useClass
            ? new registration.useClass(context, ...dependencyInstances)
            : registration.useFactory
                ? registration.useFactory(context, ...dependencyInstances)
                : (() => {
                    throw new Error(`Registration "${name}" is missing a factory or class provider.`);
                })();
        return {
            token: registration.token,
            name,
            priority,
            instance,
            dependencies,
            modules: [],
            abortController,
            registration,
            parent
        };
    }
    initializeRecord(record) {
        if (record.instance.isInitialized) {
            return;
        }
        record.instance.initialize();
        this.setBaseServiceState(record.instance, "registered", true);
        this.setBaseServiceState(record.instance, "initialized", true);
        for (const module of record.instance.serviceModules) {
            if (!module.isInitialized) {
                module.initialize();
                this.setBaseServiceState(module, "registered", true);
                this.setBaseServiceState(module, "initialized", true);
            }
        }
    }
    startRecord(record) {
        if (record.instance.isStarted) {
            return;
        }
        record.instance.start();
        this.setBaseServiceState(record.instance, "started", true);
        for (const module of record.instance.serviceModules) {
            if (!module.isStarted) {
                module.start();
                this.setBaseServiceState(module, "started", true);
            }
        }
    }
    disposeRecord(record) {
        const existing = this.findRecord(record.token, record.name);
        if (!existing || existing !== record) {
            return;
        }
        for (const moduleRecord of [...record.modules].reverse()) {
            this.disposeRecord(moduleRecord);
        }
        record.abortController.abort();
        record.instance.destroy();
        this.setBaseServiceState(record.instance, "destroyed", true);
        this.setBaseServiceState(record.instance, "registered", false);
        if (record.parent?.instance) {
            record.parent.instance.unregisterServiceModule(record.instance);
        }
        const records = this.recordsByToken.get(record.token.id) ?? [];
        const remaining = records.filter((entry) => entry !== record);
        if (remaining.length === 0) {
            this.recordsByToken.delete(record.token.id);
        }
        else {
            this.recordsByToken.set(record.token.id, remaining);
        }
        record.modules.length = 0;
    }
    addRecord(record) {
        const currentRecords = this.recordsByToken.get(record.token.id) ?? [];
        currentRecords.push(record);
        currentRecords.sort((left, right) => left.priority - right.priority);
        this.recordsByToken.set(record.token.id, currentRecords);
        if (record.instance instanceof BaseService) {
            record.instance._setRegistrationState(true);
        }
    }
    findRecord(token, name) {
        const records = this.recordsByToken.get(token.id) ?? [];
        const match = name
            ? records.find((record) => record.name === name)
            : records[0];
        return match;
    }
    forEachRecord(callback) {
        for (const record of this.getAllRecords()) {
            callback(record);
        }
    }
    getAllRecords() {
        return Array.from(this.recordsByToken.values())
            .flat()
            .sort((left, right) => left.priority - right.priority);
    }
    notifyWaiters(record) {
        const bucket = this.waiters.get(record.token.id);
        if (!bucket) {
            return;
        }
        const matchingWaiters = bucket.filter((waiter) => !waiter.name || waiter.name === record.name);
        for (const waiter of matchingWaiters) {
            clearTimeout(waiter.timeoutHandle);
            waiter.resolve(record.instance);
            this.removeWaiter(record.token.id, waiter);
        }
    }
    removeWaiter(tokenId, waiter) {
        const bucket = this.waiters.get(tokenId) ?? [];
        const remaining = bucket.filter((entry) => entry !== waiter);
        if (remaining.length === 0) {
            this.waiters.delete(tokenId);
        }
        else {
            this.waiters.set(tokenId, remaining);
        }
    }
    flushInitializationWaiters() {
        for (const waiter of this.initializationWaiters.splice(0)) {
            clearTimeout(waiter.timeoutHandle);
            waiter.resolve();
        }
    }
    walkRecordTree(record, callback) {
        callback(record);
        for (const moduleRecord of record.modules) {
            this.walkRecordTree(moduleRecord, callback);
        }
    }
    setBaseServiceState(service, state, value) {
        if (!(service instanceof BaseService)) {
            return;
        }
        if (state === "registered") {
            service._setRegistrationState(value);
            return;
        }
        if (state === "initialized") {
            service._setInitializedState(value);
            return;
        }
        if (state === "started") {
            service._setStartedState(value);
            return;
        }
        service._setDestroyedState(value);
    }
    toSnapshot(record) {
        return {
            token: record.token.description,
            name: record.name,
            priority: record.priority,
            moduleNames: record.modules.map((module) => module.name)
        };
    }
    throwIfDisposed() {
        if (this.disposed) {
            throw new Error("ServiceManager has been disposed.");
        }
    }
}
//# sourceMappingURL=service-manager.js.map