import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BaseFrameworkClientProvider,
  BaseFrameworkClientRuntime,
  useBackendAdapterService,
  useBackendAdapterState,
  useCapabilityService,
  useCapabilityState,
  useContentContextService,
  useContentContext,
  useConversationService,
  useConversationState,
  useExperienceStateService,
  useExperienceState,
  useRenderStateService,
  useRenderState,
  useSessionService,
  useSessionState
} from "../src/index.js";

function ClientStateProbe(): React.JSX.Element {
  const capabilityService = useCapabilityService();
  const capability = useCapabilityState();
  const experienceService = useExperienceStateService();
  const experience = useExperienceState();
  const sessionService = useSessionService();
  const session = useSessionState();
  const contentContextService = useContentContextService();
  const contentContext = useContentContext();
  const conversationService = useConversationService();
  const conversation = useConversationState();
  const backendService = useBackendAdapterService();
  const backend = useBackendAdapterState();
  const renderStateService = useRenderStateService();
  const render = useRenderState();

  return (
    <div>
      {[
        capabilityService.serviceName,
        capability.environmentName,
        capability.capabilities.includes("dom"),
        experienceService.serviceName,
        experience.mode,
        experience.connectionState,
        sessionService.serviceName,
        session.sessionId,
        contentContextService.serviceName,
        contentContext.page ?? "none",
        conversationService.serviceName,
        conversation.messages.length,
        backendService.serviceName,
        backend.preferredAdapter,
        renderStateService.serviceName,
        render.frame
      ].join("|")}
    </div>
  );
}

describe("base framework client react bindings", () => {
  it("creates a runtime from options and exposes client state snapshots", () => {
    const markup = renderToStaticMarkup(
      <BaseFrameworkClientProvider
        runtimeOptions={{
          profileOptions: {
            session: {
              now: () => 5
            },
            conversation: {
              now: () => 6,
              welcomeMessage: "hello"
            }
          }
        }}
      >
        <ClientStateProbe />
      </BaseFrameworkClientProvider>
    );

    expect(markup).toContain("capabilities|base-framework-client|true|experience|chat-only|idle|session|session-5|content-context|none|conversation|1|backend-adapter|mock|render-state|0");
  });

  it("uses a supplied runtime instance", () => {
    let animationLoop: ((timestamp: number) => void) | null = null;
    const runtime = new BaseFrameworkClientRuntime({
      profileOptions: {
        session: {
          now: () => 7
        }
      }
    });
    runtime.bindRenderLoop({
      setAnimationLoop(callback) {
        animationLoop = callback;
      }
    });
    const currentAnimationLoop = animationLoop as ((timestamp: number) => void) | null;
    if (currentAnimationLoop) {
      currentAnimationLoop(16);
    }

    const markup = renderToStaticMarkup(
      <BaseFrameworkClientProvider runtime={runtime}>
        <ClientStateProbe />
      </BaseFrameworkClientProvider>
    );

    expect(markup).toContain("capabilities|base-framework-client|true|experience|chat-only|idle|session|session-7|content-context|none|conversation|0|backend-adapter|mock|render-state|1");
    runtime.dispose();
  });
});
