import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  BaseFrameworkClientProvider,
  BaseFrameworkClientRuntime,
  createBaseFrameworkClientEnvironment,
  useBackendAdapterState,
  useContentContext,
  useContentContextService,
  useConversationService,
  useConversationState,
  useExperienceState,
  useExperienceStateService,
  useRenderState,
  useSessionState
} from "@realitycollective/service-framework-client";

const ClientRuntimeContext = createContext<BaseFrameworkClientRuntime | null>(null);

function createRuntime(): BaseFrameworkClientRuntime {
  const searchParams = new URLSearchParams(window.location.search);
  const endpoint = import.meta.env.VITE_AI_ENDPOINT?.trim();
  const title = import.meta.env.VITE_APP_TITLE?.trim() || "Service Framework Client Runtime";

  return new BaseFrameworkClientRuntime({
    environment: createBaseFrameworkClientEnvironment({
      name: "client-runtime-app",
      capabilities: collectCapabilities()
    }),
    profileOptions: {
      profileName: "client-runtime-app",
      experience: {
        initialMode: "avatar",
        initialWidgetState: "open"
      },
      conversation: {
        welcomeMessage: endpoint
          ? `Connected to ${title} via REST adapter.`
          : `Connected to ${title} via mock adapter.`
      },
      context: {
        page: window.location.pathname,
        ...(searchParams.get("campaign") ? { campaign: searchParams.get("campaign")! } : {})
      },
      backend: {
        preferredAdapter: endpoint ? "rest" : "mock",
        includeMockAdapter: true,
        ...(endpoint ? { rest: { endpoint } } : {})
      }
    }
  });
}

function collectCapabilities(): string[] {
  const capabilities: string[] = [];

  if (typeof window !== "undefined" && "WebGLRenderingContext" in window) {
    capabilities.push("webgl");
  }

  if ("geolocation" in navigator) {
    capabilities.push("geolocation");
  }

  if ("share" in navigator) {
    capabilities.push("web-share");
  }

  if ("xr" in navigator) {
    capabilities.push("webxr-ar");
  }

  if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) {
    capabilities.push("ios");
    capabilities.push("ios-8thwall-candidate");
  }

  return capabilities;
}

function useRuntime(): BaseFrameworkClientRuntime {
  const runtime = useContext(ClientRuntimeContext);

  if (!runtime) {
    throw new Error("Client runtime context is required.");
  }

  return runtime;
}

function AppHeader(): React.JSX.Element {
  const backend = useBackendAdapterState();
  const session = useSessionState();

  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Deployable runtime client</p>
        <h1>{import.meta.env.VITE_APP_TITLE?.trim() || "Service Framework Client Runtime"}</h1>
        <p className="subtitle">
          Standalone React + three.js client application consuming the local Service Framework packages.
        </p>
      </div>
      <dl className="header-stats">
        <div>
          <dt>Adapter</dt>
          <dd>{backend.activeAdapter ?? backend.preferredAdapter}</dd>
        </div>
        <div>
          <dt>Connection</dt>
          <dd>{backend.state}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{session.sessionId}</dd>
        </div>
      </dl>
    </header>
  );
}

function ConversationPanel(): React.JSX.Element {
  const conversation = useConversationState();
  const conversationService = useConversationService();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      setError("Enter a message before sending.");
      return;
    }

    setError(null);

    try {
      await conversationService.sendUserMessage(trimmedMessage);
      setMessage("");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : String(submissionError));
    }
  }

  return (
    <section className="panel conversation-panel">
      <div className="panel-header">
        <div>
          <h2>Conversation</h2>
          <p>Message flow is driven by framework services and adapter modules.</p>
        </div>
        <span className={`status-pill status-${conversation.status}`}>{conversation.status}</span>
      </div>
      <div className="messages">
        {conversation.messages.map((entry) => (
          <article key={entry.id} className={`message message-${entry.role}`}>
            <header>
              <strong>{entry.role}</strong>
              <time>{new Date(entry.timestamp).toLocaleTimeString()}</time>
            </header>
            <p>{entry.content}</p>
          </article>
        ))}
      </div>
      <form className="composer" onSubmit={handleSubmit}>
        <label htmlFor="chat-message">Send a test message</label>
        <textarea
          id="chat-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask the client something..."
          rows={3}
        />
        <div className="composer-actions">
          <button type="submit">Send message</button>
          {error ? <span className="inline-error">{error}</span> : null}
        </div>
      </form>
    </section>
  );
}

function ExperiencePanel(): React.JSX.Element {
  const experience = useExperienceState();
  const experienceService = useExperienceStateService();
  const contentContext = useContentContext();
  const contentContextService = useContentContextService();
  const [geoState, setGeoState] = useState("idle");
  const [geoError, setGeoError] = useState<string | null>(null);

  function setWidgetState(widgetState: "closed" | "open" | "minimized"): void {
    if (widgetState === "open") {
      experienceService.openWidget();
      return;
    }

    if (widgetState === "minimized") {
      experienceService.minimizeWidget();
      return;
    }

    experienceService.closeWidget();
  }

  async function useBrowserLocation(): Promise<void> {
    if (!("geolocation" in navigator)) {
      setGeoError("Browser geolocation is unavailable.");
      return;
    }

    setGeoError(null);
    setGeoState("requesting");

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 30000,
          timeout: 15000
        });
      });

      contentContextService.setGeolocation(position.coords.latitude, position.coords.longitude);
      setGeoState("ready");
    } catch (locationError) {
      setGeoState("error");
      setGeoError(locationError instanceof Error ? locationError.message : String(locationError));
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Experience controls</h2>
          <p>Switch modes and feed browser context back into the service runtime.</p>
        </div>
      </div>
      <div className="control-grid">
        <div>
          <h3>Mode</h3>
          <div className="button-row">
            {(["chat-only", "avatar", "xr"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={experience.mode === mode ? "active" : undefined}
                onClick={() => experienceService.setMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3>Widget state</h3>
          <div className="button-row">
            {(["open", "minimized", "closed"] as const).map((widgetState) => (
              <button
                key={widgetState}
                type="button"
                className={experience.widgetState === widgetState ? "active" : undefined}
                onClick={() => setWidgetState(widgetState)}
              >
                {widgetState}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="context-card">
        <div>
          <h3>Location context</h3>
          <p>
            Current page: <strong>{contentContext.page ?? "/"}</strong>
          </p>
          <p>
            Campaign: <strong>{contentContext.campaign ?? "none"}</strong>
          </p>
          <p>
            Geolocation:{" "}
            <strong>
              {contentContext.geolocation
                ? `${contentContext.geolocation.latitude.toFixed(5)}, ${contentContext.geolocation.longitude.toFixed(5)}`
                : "not set"}
            </strong>
          </p>
        </div>
        <div className="context-actions">
          <button type="button" onClick={() => void useBrowserLocation()}>
            Use browser location
          </button>
          <span className="geo-state">state: {geoState}</span>
          {geoError ? <span className="inline-error">{geoError}</span> : null}
        </div>
      </div>
    </section>
  );
}

function DiagnosticsPanel(): React.JSX.Element {
  const experience = useExperienceState();
  const backend = useBackendAdapterState();
  const contentContext = useContentContext();
  const renderState = useRenderState();
  const session = useSessionState();

  const capabilityList = collectCapabilities();

  return (
    <section className="panel diagnostics-panel">
      <div className="panel-header">
        <div>
          <h2>Diagnostics</h2>
          <p>Useful state for deployment, adapter debugging, and XR readiness checks.</p>
        </div>
      </div>
      <dl className="diagnostic-grid">
        <div>
          <dt>Preferred adapter</dt>
          <dd>{backend.preferredAdapter}</dd>
        </div>
        <div>
          <dt>Active adapter</dt>
          <dd>{backend.activeAdapter ?? "none"}</dd>
        </div>
        <div>
          <dt>Experience mode</dt>
          <dd>{experience.mode}</dd>
        </div>
        <div>
          <dt>Widget state</dt>
          <dd>{experience.widgetState}</dd>
        </div>
        <div>
          <dt>Render frame</dt>
          <dd>{renderState.frame}</dd>
        </div>
        <div>
          <dt>Last activity</dt>
          <dd>{new Date(session.lastActivityAt).toLocaleTimeString()}</dd>
        </div>
      </dl>
      <div className="capability-list">
        {capabilityList.map((capability) => (
          <span key={capability} className="capability-chip">
            {capability}
          </span>
        ))}
      </div>
      <pre className="json-preview">{JSON.stringify({ backend, contentContext, renderState }, null, 2)}</pre>
    </section>
  );
}

function XrReadinessPanel(): React.JSX.Element {
  const capabilities = new Set(collectCapabilities());
  const hasWebXR = capabilities.has("webxr-ar");
  const isIosCandidate = capabilities.has("ios-8thwall-candidate");

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>XR readiness</h2>
          <p>The standalone client is deployable now; XR runtime modules are the next integration phase.</p>
        </div>
      </div>
      <ul className="xr-checklist">
        <li className={hasWebXR ? "ready" : "pending"}>
          Native WebXR: {hasWebXR ? "candidate detected" : "not detected"}
        </li>
        <li className={isIosCandidate ? "ready" : "pending"}>
          iOS / 8th Wall path: {isIosCandidate ? "candidate detected" : "not detected"}
        </li>
        <li className="pending">8th Wall runtime loading: pending module integration</li>
        <li className="pending">AR placement flow: pending module integration</li>
      </ul>
    </section>
  );
}

function ThreeViewport(): React.JSX.Element {
  const runtime = useRuntime();
  const experience = useExperienceState();
  const renderState = useRenderState();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneStateRef = useRef({
    mode: experience.mode,
    connectionState: experience.connectionState
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sceneStateRef.current = {
      mode: experience.mode,
      connectionState: experience.connectionState
    };
  }, [experience.connectionState, experience.mode]);

  useEffect(() => {
    const mountElement = mountRef.current;

    if (!mountElement) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x7c9cff });
    const cube = new THREE.Mesh(geometry, material);
    const fillLight = new THREE.HemisphereLight(0xffffff, 0x1f2847, 1.4);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2);
    const resizeObserver = new ResizeObserver(() => resizeRenderer());

    function resizeRenderer(): void {
      const width = mountElement?.clientWidth || 320;
      const height = mountElement?.clientHeight || 240;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    try {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      mountElement.appendChild(renderer.domElement);
      resizeRenderer();
      resizeObserver.observe(mountElement);

      cube.position.set(0, 0.15, 0);
      scene.add(cube);
      scene.add(fillLight);
      scene.add(keyLight);

      keyLight.position.set(3, 4, 2);
      camera.position.set(0, 0.8, 3.2);

      const bridge = runtime.bindRenderLoop({
        setAnimationLoop(callback: ((timestamp: number) => void) | null) {
          renderer.setAnimationLoop((timestamp) => {
            if (!callback) {
              return;
            }

            callback(timestamp);

            const currentState = sceneStateRef.current;
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.014;
            cube.scale.setScalar(currentState.mode === "xr" ? 1.25 : 1);
            material.color.set(
              currentState.connectionState === "sending"
                ? 0xffb454
                : currentState.mode === "xr"
                  ? 0x46d3ff
                  : currentState.mode === "avatar"
                    ? 0x7c9cff
                    : 0x9ba7b9
            );

            renderer.render(scene, camera);
          });

          if (callback === null) {
            renderer.setAnimationLoop(null);
          }
        }
      });

      return () => {
        resizeObserver.disconnect();
        bridge.dispose();
        renderer.dispose();
        geometry.dispose();
        material.dispose();
        mountElement.replaceChildren();
      };
    } catch (viewportError) {
      setError(viewportError instanceof Error ? viewportError.message : String(viewportError));
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      return undefined;
    }
  }, [runtime]);

  return (
    <section className="panel viewport-panel">
      <div className="panel-header">
        <div>
          <h2>three.js viewport</h2>
          <p>Placeholder runtime viewport wired through the framework render loop bridge.</p>
        </div>
        <span className="status-pill">frame {renderState.frame}</span>
      </div>
      {error ? <p className="inline-error">{error}</p> : null}
      <div ref={mountRef} className="viewport-surface" />
    </section>
  );
}

function ClientShell(): React.JSX.Element {
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="app-grid">
        <ConversationPanel />
        <ThreeViewport />
        <ExperiencePanel />
        <XrReadinessPanel />
        <DiagnosticsPanel />
      </main>
    </div>
  );
}

export function App(): React.JSX.Element {
  const runtime = useMemo(() => createRuntime(), []);

  useEffect(() => {
    return () => {
      runtime.dispose();
    };
  }, [runtime]);

  return (
    <ClientRuntimeContext.Provider value={runtime}>
      <BaseFrameworkClientProvider runtime={runtime}>
        <ClientShell />
      </BaseFrameworkClientProvider>
    </ClientRuntimeContext.Provider>
  );
}

