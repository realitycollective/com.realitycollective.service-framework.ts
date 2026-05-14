# Walkthrough: create a small deployable weather client

This example builds a small React + TypeScript web app that:

- creates a Service Framework profile
- registers a `WeatherService`
- asks the browser for the current location
- fetches weather data for that location
- displays the result on the home screen

The example uses the free Open-Meteo API so you do not need an API key while learning.

A runnable version of this walkthrough lives at [runtime-examples/weather-client-example](../runtime-examples/weather-client-example/README.md). If you want to run the finished app immediately, start there. If you want to understand how to build it step by step, read on.

## Before you start

You need:

- Node.js and npm installed
- a terminal such as PowerShell
- the published Service Framework packages from npm, or local `file:` references if you are working from this repository

If you are working from this repository directly, the existing [weather-client-example](../runtime-examples/weather-client-example/README.md) is the ready-to-run version of everything described below.

## Step 1: create the app shell

Create a new React + TypeScript application with Vite:

```powershell
npm create vite@latest service-framework-weather -- --template react-ts
cd service-framework-weather
npm install
```

What this does:

- creates a new folder named `service-framework-weather`
- sets up React and TypeScript for you
- installs the starter dependencies

## Step 2: add the framework packages

Install the published packages from npm:

```sh
npm install @realitycollective/service-framework@preview @realitycollective/service-framework-react@preview
```

If you are working locally against this repository instead, add `file:` dependencies pointing to the packages in `packages/`:

```sh
npm install ../../packages/service-framework ../../packages/service-framework-react
```

## Step 3: create the example files

Add these files to `src/`:

```text
src/
  App.tsx
  main.tsx
  profile.ts
  services/
    tokens.ts
    weather-service.ts
```

## Step 4: define the token

Create `src/services/tokens.ts`:

```ts
import { createServiceToken } from "@realitycollective/service-framework";
import type { WeatherService } from "./weather-service";

export const WEATHER_SERVICE_TOKEN = createServiceToken<WeatherService>("WeatherService");
```

## Step 5: create the weather service

Create `src/services/weather-service.ts`:

```ts
import { BaseService } from "@realitycollective/service-framework";

export interface WeatherServiceConfig {
  readonly temperatureUnit: "celsius" | "fahrenheit";
}

export interface WeatherResult {
  readonly latitude: number;
  readonly longitude: number;
  readonly temperature: number;
  readonly weatherCode: number;
  readonly description: string;
}

export class WeatherService extends BaseService<WeatherServiceConfig> {
  public async getCurrentWeather(): Promise<WeatherResult> {
    const position = await this.getCurrentPosition();
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("current", "temperature_2m,weather_code");
    url.searchParams.set("temperature_unit", this.serviceConfig.temperatureUnit);

    const response = await fetch(url, { signal: this.abortSignal });

    if (!response.ok) {
      throw new Error(`Weather request failed with status ${response.status}.`);
    }

    const payload = await response.json() as {
      readonly current?: {
        readonly temperature_2m?: number;
        readonly weather_code?: number;
      };
    };

    if (payload.current?.temperature_2m === undefined || payload.current.weather_code === undefined) {
      throw new Error("Weather response did not include current conditions.");
    }

    return {
      latitude,
      longitude,
      temperature: payload.current.temperature_2m,
      weatherCode: payload.current.weather_code,
      description: describeWeatherCode(payload.current.weather_code)
    };
  }

  private async getCurrentPosition(): Promise<GeolocationPosition> {
    if (!("geolocation" in navigator)) {
      throw new Error("This browser does not support geolocation.");
    }

    return await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 15000
      });
    });
  }
}

function describeWeatherCode(code: number): string {
  switch (code) {
    case 0:
      return "Clear sky";
    case 1:
    case 2:
    case 3:
      return "Partly cloudy";
    case 45:
    case 48:
      return "Fog";
    case 51:
    case 53:
    case 55:
      return "Drizzle";
    case 61:
    case 63:
    case 65:
      return "Rain";
    case 71:
    case 73:
    case 75:
      return "Snow";
    case 95:
      return "Thunderstorm";
    default:
      return `Weather code ${code}`;
  }
}
```

What this service does:

- reads the configuration from `serviceConfig`
- uses the browser geolocation API to get the current location
- calls a public weather API
- returns a typed result object
- uses `abortSignal` so the request can be cancelled if the service is disposed

## Step 6: register the service in a profile

Create `src/profile.ts`:

```ts
import { createServiceProfile } from "@realitycollective/service-framework";
import { WEATHER_SERVICE_TOKEN } from "./services/tokens";
import { WeatherService } from "./services/weather-service";

export const profile = createServiceProfile("weather-client", [
  {
    token: WEATHER_SERVICE_TOKEN,
    config: {
      temperatureUnit: "celsius"
    },
    useClass: WeatherService
  }
]);
```

## Step 7: provide the framework to React

Create `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ServiceFrameworkProvider } from "@realitycollective/service-framework-react";
import { App } from "./App";
import { profile } from "./profile";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ServiceFrameworkProvider profile={profile}>
      <App />
    </ServiceFrameworkProvider>
  </React.StrictMode>
);
```

This is the point where React and the Service Framework meet. The provider initializes the profile and makes the service manager available to all child components.

## Step 8: consume the service on the home screen

Create `src/App.tsx`:

```tsx
import React, { useState } from "react";
import { useService } from "@realitycollective/service-framework-react";
import { WEATHER_SERVICE_TOKEN } from "./services/tokens";
import type { WeatherResult } from "./services/weather-service";

export function App(): React.JSX.Element {
  const weatherService = useService(WEATHER_SERVICE_TOKEN);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadWeather(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const result = await weatherService.getCurrentWeather();
      setWeather(result);
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : String(serviceError));
      setWeather(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: "sans-serif", maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <p>Reality Collective Service Framework</p>
      <h1>Weather at my current location</h1>
      <p>
        This screen resolves a service from the framework and asks that service to fetch the weather.
      </p>

      <button type="button" onClick={() => void loadWeather()} disabled={loading}>
        {loading ? "Loading weather..." : "Get weather for my location"}
      </button>

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      {weather ? (
        <section>
          <h2>Current conditions</h2>
          <p>Temperature: {weather.temperature} degrees</p>
          <p>Conditions: {weather.description}</p>
          <p>
            Coordinates: {weather.latitude.toFixed(3)}, {weather.longitude.toFixed(3)}
          </p>
        </section>
      ) : null}
    </main>
  );
}
```

This component is doing three simple things:

1. resolving the weather service with `useService()`
2. calling the service when the user clicks a button
3. storing the result in React state so the UI updates

## Step 9: run and build the app

During development:

```powershell
npm run dev
```

To create a production build:

```powershell
npm run build
```

The built files are written to `dist/`. You can deploy that folder to a static web host.

Useful options include:

- Azure Static Web Apps
- Netlify
- Vercel
- GitHub Pages, if your routing and asset paths are configured for it

Important note: browser geolocation usually requires `https://` in production. It also works on `http://localhost` during local development.

---

## Appendix: abstracting the weather provider as a service module

The `WeatherService` you built in the walkthrough is self-contained: it knows how to get the user's location and also knows the specific Open-Meteo API. That is fine for a small example, but as an app grows you often want to separate what the service does from which provider it delegates to. You might want to swap Open-Meteo for a paid provider with more data, point a test suite at a stub that returns fixed values, or support multiple providers at once.

Service modules are the framework's pattern for exactly this. A module is a child service that:

- is initialized and started alongside its parent
- has access to the parent via `parentService`
- follows the same lifecycle (`initialize`, `start`, `destroy`, etc.)
- is registered under the parent's entry in the profile, not as a top-level service

The result is that swapping providers becomes a profile change. The `WeatherService` itself does not change at all.

### What changes and what stays the same

| File | Change |
| --- | --- |
| `services/weather-provider-module.ts` | new — abstract base module that any provider must extend |
| `services/open-meteo-provider-module.ts` | new — the concrete Open-Meteo implementation, extracted from `WeatherService` |
| `services/weather-service.ts` | updated — delegates the fetch call to whichever provider module is attached |
| `profile.ts` | updated — registers the provider module under the `WeatherService` entry |
| `App.tsx`, `main.tsx`, `tokens.ts` | unchanged |

### Step A1: define the abstract provider module

Create `src/services/weather-provider-module.ts`:

```ts
import { BaseServiceModule } from "@realitycollective/service-framework";
import type { WeatherService, WeatherResult } from "./weather-service";

export abstract class WeatherProviderModule extends BaseServiceModule<WeatherService> {
  public abstract fetchWeather(
    latitude: number,
    longitude: number,
    temperatureUnit: "celsius" | "fahrenheit"
  ): Promise<WeatherResult>;
}
```

This is the contract every provider must fulfil. It says nothing about which API to call, what credentials to use, or how data is mapped — those are the provider's private concerns. `WeatherService` only needs to know this interface exists.

### Step A2: extract the Open-Meteo implementation

Create `src/services/open-meteo-provider-module.ts`:

```ts
import { WeatherProviderModule } from "./weather-provider-module";
import type { WeatherResult } from "./weather-service";

export class OpenMeteoProviderModule extends WeatherProviderModule {
  public override async fetchWeather(
    latitude: number,
    longitude: number,
    temperatureUnit: "celsius" | "fahrenheit"
  ): Promise<WeatherResult> {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("current", "temperature_2m,weather_code");
    url.searchParams.set("temperature_unit", temperatureUnit);

    const response = await fetch(url, { signal: this.abortSignal });

    if (!response.ok) {
      throw new Error(`Weather request failed with status ${response.status}.`);
    }

    const payload = await response.json() as {
      readonly current?: {
        readonly temperature_2m?: number;
        readonly weather_code?: number;
      };
    };

    if (
      payload.current?.temperature_2m === undefined ||
      payload.current.weather_code === undefined
    ) {
      throw new Error("Weather response did not include current conditions.");
    }

    return {
      latitude,
      longitude,
      temperature: payload.current.temperature_2m,
      weatherCode: payload.current.weather_code,
      description: describeWeatherCode(payload.current.weather_code)
    };
  }
}

function describeWeatherCode(code: number): string {
  switch (code) {
    case 0: return "Clear sky";
    case 1: case 2: case 3: return "Partly cloudy";
    case 45: case 48: return "Fog";
    case 51: case 53: case 55: return "Drizzle";
    case 61: case 63: case 65: return "Rain";
    case 71: case 73: case 75: return "Snow";
    case 95: return "Thunderstorm";
    default: return `Weather code ${code}`;
  }
}
```

Everything that was inside `WeatherService` and touched the Open-Meteo API now lives here. The `abortSignal` is available because `BaseServiceModule` extends `BaseService`, so the same `this.abortSignal` property is present.

### Step A3: update WeatherService to delegate to the provider

Replace the body of `src/services/weather-service.ts` with this:

```ts
import { BaseService } from "@realitycollective/service-framework";
import { WeatherProviderModule } from "./weather-provider-module";

export interface WeatherServiceConfig {
  readonly temperatureUnit: "celsius" | "fahrenheit";
}

export interface WeatherResult {
  readonly latitude: number;
  readonly longitude: number;
  readonly temperature: number;
  readonly weatherCode: number;
  readonly description: string;
}

export class WeatherService extends BaseService<WeatherServiceConfig> {
  public async getCurrentWeather(): Promise<WeatherResult> {
    const provider = this.serviceModules.find(
      (m): m is WeatherProviderModule => m instanceof WeatherProviderModule
    );

    if (provider === undefined) {
      throw new Error("WeatherService has no provider module registered.");
    }

    const position = await this.getCurrentPosition();

    return provider.fetchWeather(
      position.coords.latitude,
      position.coords.longitude,
      this.serviceConfig.temperatureUnit
    );
  }

  private async getCurrentPosition(): Promise<GeolocationPosition> {
    if (!("geolocation" in navigator)) {
      throw new Error("This browser does not support geolocation.");
    }

    return await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 15000
      });
    });
  }
}
```

`this.serviceModules` is a readonly array of every module attached to this service. The `find` call with a type predicate (`m is WeatherProviderModule`) narrows the result so TypeScript knows the found value has a `fetchWeather` method. `WeatherService` now has no import of and no knowledge of `OpenMeteoProviderModule`.

### Step A4: attach the provider module in the profile

Update `src/profile.ts`:

```ts
import { createServiceProfile } from "@realitycollective/service-framework";
import { WEATHER_SERVICE_TOKEN } from "./services/tokens";
import { WeatherService } from "./services/weather-service";
import { OpenMeteoProviderModule } from "./services/open-meteo-provider-module";

export const profile = createServiceProfile("weather-client", [
  {
    token: WEATHER_SERVICE_TOKEN,
    config: {
      temperatureUnit: "celsius"
    },
    useClass: WeatherService,
    modules: [
      {
        name: "open-meteo-provider",
        useClass: OpenMeteoProviderModule
      }
    ]
  }
]);
```

The only change from the original profile is the `modules` array on the `WeatherService` registration. The module is initialized and started with its parent service automatically.

### Swapping to a different provider

To use a different provider — for example a paid service with hourly forecasts — create another module that extends `WeatherProviderModule` and replace the entry in `modules`:

```ts
import { TomorrowIoProviderModule } from "./services/tomorrow-io-provider-module";

modules: [
  {
    name: "tomorrow-io-provider",
    config: { apiKey: import.meta.env.VITE_TOMORROW_IO_KEY },
    useClass: TomorrowIoProviderModule
  }
]
```

`WeatherService`, `App.tsx`, and every other file are untouched. The only change is the profile.

### Using a stub provider in tests

The same pattern makes unit testing straightforward. A stub module returns a fixed result instead of hitting the network:

```ts
import { WeatherProviderModule } from "./weather-provider-module";
import type { WeatherResult } from "./weather-service";

export class StubWeatherProviderModule extends WeatherProviderModule {
  public override async fetchWeather(): Promise<WeatherResult> {
    return {
      latitude: 51.5,
      longitude: -0.1,
      temperature: 14,
      weatherCode: 1,
      description: "Partly cloudy"
    };
  }
}
```

Register `StubWeatherProviderModule` in your test profile the same way you register the real one. The `WeatherService` code path is exercised without any network calls.

### Summary of the pattern

The core idea is that the service owns the workflow and the module owns the integration:

- `WeatherService` — knows how to ask for location, knows what `WeatherResult` looks like, knows which config options are meaningful
- `WeatherProviderModule` — defines the contract between service and provider
- `OpenMeteoProviderModule` — knows the Open-Meteo API, endpoint, and response shape; nothing else does
- Profile — the only place that decides which provider is in use

This separation pays off whenever requirements change at the integration boundary: a new provider, a backend proxy, a different unit system, or a test stub are all profile-level decisions.
