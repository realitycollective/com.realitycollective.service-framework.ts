import {
  BaseService,
  ManualScheduler,
  ServiceManager,
  createServiceProfile,
  createServiceToken,
  type LifecycleContext
} from "@realitycollective/service-framework";
import { ThreeRenderLoopBridge } from "@realitycollective/service-framework-three";

const RENDER_TOKEN = createServiceToken<RenderStatsService>("RenderStatsService");

class RenderStatsService extends BaseService {
  override render(context: LifecycleContext): void {
    console.log(`Frame ${context.frame} via ${context.source}`);
  }
}

const scheduler = new ManualScheduler();
const manager = new ServiceManager({ scheduler });

manager.initializeProfile(createServiceProfile("three-example", [
  {
    token: RENDER_TOKEN,
    useFactory: (context) => new RenderStatsService(context)
  }
]));
manager.start();

const bridge = new ThreeRenderLoopBridge({
  scheduler,
  host: {
    setAnimationLoop(callback) {
      if (callback) {
        callback(performance.now());
      }
    }
  }
});

bridge.start();
