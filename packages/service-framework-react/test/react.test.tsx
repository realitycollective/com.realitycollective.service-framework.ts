import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BaseService,
  ManualScheduler,
  ServiceManager,
  createBrowserEnvironment,
  createServiceProfile,
  createServiceToken
} from "@realitycollective/service-framework";
import {
  ServiceFrameworkProvider,
  useService,
  useServiceManager,
  useServices
} from "../src/index.js";

const REACT_TOKEN = createServiceToken<ReactExampleService>("ReactExampleService");

class ReactExampleService extends BaseService {
  public override initialize(): void {}
}

function ServiceConsumer(): React.JSX.Element {
  const manager = useServiceManager();
  const service = useService(REACT_TOKEN);
  const services = useServices(REACT_TOKEN);

  return <div>{`${manager.isStarted}:${service.serviceName}:${services.length}`}</div>;
}

describe("react bindings", () => {
  it("creates and exposes a service manager from a profile", () => {
    const markup = renderToStaticMarkup(
      <ServiceFrameworkProvider
        profile={createServiceProfile("react", [
          {
            token: REACT_TOKEN,
            useFactory: (context) => new ReactExampleService(context)
          }
        ])}
      >
        <ServiceConsumer />
      </ServiceFrameworkProvider>
    );

    expect(markup).toContain("true:ReactExampleService:1");
  });

  it("uses a supplied manager and respects autoStart overrides", () => {
    const manager = new ServiceManager();
    manager.initializeProfile(createServiceProfile("manual", [
      {
        token: REACT_TOKEN,
        name: "manual",
        useFactory: (context) => new ReactExampleService(context)
      }
    ]));

    const markup = renderToStaticMarkup(
      <ServiceFrameworkProvider manager={manager} autoStart={false}>
        <ServiceConsumer />
      </ServiceFrameworkProvider>
    );

    expect(markup).toContain("false:manual:1");
  });

  it("creates a manager when scheduler and environment are supplied", () => {
    const markup = renderToStaticMarkup(
      <ServiceFrameworkProvider
        scheduler={new ManualScheduler()}
        environment={createBrowserEnvironment()}
        profile={createServiceProfile("env-aware", [
          {
            token: REACT_TOKEN,
            name: "env-aware",
            useFactory: (context) => new ReactExampleService(context)
          }
        ])}
      >
        <ServiceConsumer />
      </ServiceFrameworkProvider>
    );

    expect(markup).toContain("true:env-aware:1");
  });

  it("throws when hooks are used outside the provider", () => {
    expect(() => renderToStaticMarkup(<ServiceConsumer />)).toThrow("ServiceFrameworkProvider is required before calling useServiceManager.");
  });
});
