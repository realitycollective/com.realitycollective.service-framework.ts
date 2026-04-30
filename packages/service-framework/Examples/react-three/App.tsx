import React from "react";
import {
  BaseService,
  ManualScheduler,
  ServiceManager,
  createServiceProfile,
  createServiceToken,
  type LifecycleContext
} from "@realitycollective/service-framework";
import {
  ServiceFrameworkProvider,
  useService
} from "@realitycollective/service-framework-react";
import { ThreeRenderLoopBridge } from "@realitycollective/service-framework-three";

const RENDERER_TOKEN = createServiceToken<RendererStateService>("RendererStateService");

class RendererStateService extends BaseService {
  public lastFrame = 0;

  override render(context: LifecycleContext): void {
    this.lastFrame = context.frame;
  }
}

function FramePanel(): React.JSX.Element {
  const renderer = useService(RENDERER_TOKEN);
  return <span>{renderer.lastFrame}</span>;
}

const scheduler = new ManualScheduler();
const manager = new ServiceManager({ scheduler });

manager.initializeProfile(createServiceProfile("react-three-example", [
  {
    token: RENDERER_TOKEN,
    useFactory: (context) => new RendererStateService(context)
  }
]));
manager.start();

new ThreeRenderLoopBridge({
  scheduler,
  host: {
    setAnimationLoop(callback) {
      if (callback) {
        callback(16);
      }
    }
  }
}).start();

export function App(): React.JSX.Element {
  return (
    <ServiceFrameworkProvider manager={manager}>
      <FramePanel />
    </ServiceFrameworkProvider>
  );
}
