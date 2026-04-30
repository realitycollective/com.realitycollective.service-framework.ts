import {
  BaseService,
  ServiceManager,
  TimerScheduler,
  createBrowserEnvironment,
  createServiceProfile,
  createServiceToken
} from "@realitycollective/service-framework";

const LOGGER_TOKEN = createServiceToken<LoggerService>("LoggerService");
const CLOCK_TOKEN = createServiceToken<ClockService>("ClockService");

class LoggerService extends BaseService {
  override initialize(): void {
    console.log(`[${this.serviceName}] ready`);
  }
}

class ClockService extends BaseService {
  constructor(context: ConstructorParameters<typeof BaseService>[0], private readonly logger: LoggerService) {
    super(context);
  }

  override update(): void {
    console.log(`[${this.serviceName}] tick`);
    void this.logger;
  }
}

const scheduler = new TimerScheduler({
  requestAnimationFrameFn: (callback) => window.requestAnimationFrame(callback),
  cancelAnimationFrameFn: (handle) => window.cancelAnimationFrame(handle)
});

const manager = new ServiceManager({
  scheduler,
  environment: createBrowserEnvironment()
});

manager.initializeProfile(createServiceProfile("plain-web", [
  {
    token: LOGGER_TOKEN,
    useClass: LoggerService
  },
  {
    token: CLOCK_TOKEN,
    dependencies: [LOGGER_TOKEN],
    useClass: ClockService
  }
]));

scheduler.start();
