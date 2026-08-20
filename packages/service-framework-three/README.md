# @realitycollective/service-framework-three

**three.js render-loop bridge** for the Reality Collective TypeScript Service Framework - connects `renderer.setAnimationLoop()` to the framework's `renderTick` scheduler channel.

```sh
npm install @realitycollective/service-framework @realitycollective/service-framework-three
```

Services written against `BaseService<TConfig>` run unchanged on three.js, Babylon.js or IWSDK - only the bridge differs.

## Usage

```ts
import { ManualScheduler, ServiceManager, createServiceProfile } from "@realitycollective/service-framework";
import { ThreeRenderLoopBridge } from "@realitycollective/service-framework-three";
import { WebGLRenderer } from "three";

const scheduler = new ManualScheduler();
const manager = new ServiceManager({ scheduler });

manager.initializeProfile(createServiceProfile("my-app", [/* your service registrations */]));
manager.start();

const renderer = new WebGLRenderer({ canvas });
const bridge = new ThreeRenderLoopBridge({ scheduler, host: renderer });
bridge.start();
// Every three.js frame now emits renderTick to all registered services.
```

`host` is anything with `setAnimationLoop` (the `AnimationLoopHostLike` interface), so a `WebGLRenderer`, `WebGPURenderer` or a test double all work.

## Live examples

- Weather client walkthrough: **[service-framework-weather.pages.dev](https://service-framework-weather.pages.dev)**
- Client runtime reference: **[service-framework-client-app.pages.dev](https://service-framework-client-app.pages.dev)**

## Documentation

See the [repository README](https://github.com/realitycollective/com.realitycollective.service-framework.ts#readme) and this package's `Examples/` folder.

## License

MIT - see [LICENSE](./LICENSE).
