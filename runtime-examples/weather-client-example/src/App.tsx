import React, { useState } from "react";
import { useService } from "@realitycollective/service-framework-react";
import { WEATHER_SERVICE_TOKEN } from "./services/tokens.js";
import type { WeatherResult } from "./services/weather-service.js";

type RequestStatus = "idle" | "loading" | "ready" | "error";

export function App(): React.JSX.Element {
  const weatherService = useService(WEATHER_SERVICE_TOKEN);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  async function loadWeather(): Promise<void> {
    setStatus("loading");
    setError(null);

    try {
      const result = await weatherService.getCurrentWeather();
      setWeather(result);
      setStatus("ready");
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : String(serviceError));
      setWeather(null);
      setStatus("error");
    }
  }

  return (
    <div className="page-shell">
      <div className="backdrop-orb backdrop-orb-left" />
      <div className="backdrop-orb backdrop-orb-right" />
      <main className="page-layout">
        <section className="hero panel">
          <div>
            <p className="eyebrow">Runtime example</p>
            <h1>{import.meta.env.VITE_APP_TITLE?.trim() || "Service Framework Weather Client"}</h1>
            <p className="lede">
              This app resolves a `WeatherService` through the TypeScript Service Framework, asks the browser for the
              current location, and then fetches live weather data from Open-Meteo.
            </p>
          </div>
          <div className="hero-summary">
            <span className={`status-pill status-${status}`}>{describeStatus(status)}</span>
            <dl>
              <div>
                <dt>Resolved service</dt>
                <dd>{weatherService.serviceName}</dd>
              </div>
              <div>
                <dt>Temperature unit</dt>
                <dd>{weatherService.serviceConfig.temperatureUnit}</dd>
              </div>
              <div>
                <dt>Registered by</dt>
                <dd>src/profile.ts</dd>
              </div>
            </dl>
          </div>
        </section>

        <div className="content-grid">
          <section className="panel action-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Home screen</p>
                <h2>Get weather at my current location</h2>
              </div>
            </div>

            <p className="body-copy">
              The component does not call the weather API directly. It resolves the service instance with `useService()`
              and lets the service own geolocation and network access.
            </p>

            <button
              type="button"
              className="primary-button"
              onClick={() => void loadWeather()}
              disabled={status === "loading"}
            >
              {status === "loading" ? "Loading weather..." : "Get weather for my location"}
            </button>

            {error ? <p className="error-text">{error}</p> : null}

            {weather ? (
              <div className="weather-grid">
                <article className="weather-card temperature-card">
                  <p className="weather-label">Current temperature</p>
                  <p className="weather-value">
                    {weather.temperature.toFixed(1)}{getTemperatureSymbol(weather.temperatureUnit)}
                  </p>
                  <p className="weather-note">Feels like {weather.apparentTemperature.toFixed(1)}{getTemperatureSymbol(weather.temperatureUnit)}</p>
                </article>

                <article className="weather-card">
                  <p className="weather-label">Conditions</p>
                  <p className="weather-strong">{weather.description}</p>
                  <p className="weather-note">{weather.isDay ? "Daytime conditions" : "Night-time conditions"}</p>
                </article>

                <article className="weather-card">
                  <p className="weather-label">Wind speed</p>
                  <p className="weather-strong">{weather.windSpeed.toFixed(1)} km/h</p>
                  <p className="weather-note">Open-Meteo current conditions</p>
                </article>

                <article className="weather-card coordinates-card">
                  <p className="weather-label">Coordinates</p>
                  <p className="weather-strong">{weather.latitude.toFixed(3)}, {weather.longitude.toFixed(3)}</p>
                  <p className="weather-note">Updated {formatTimestamp(weather.fetchedAt)}</p>
                </article>
              </div>
            ) : (
              <div className="empty-state">
                <p>Press the button to trigger the service workflow.</p>
                <p>Browser geolocation permission is requested first, then the weather service performs the fetch.</p>
              </div>
            )}
          </section>

          <section className="panel teaching-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Teaching notes</p>
                <h2>What the framework is doing</h2>
              </div>
            </div>

            <ol className="teaching-list">
              <li>
                <strong>Token:</strong> `src/services/tokens.ts` gives the weather service a runtime identity.
              </li>
              <li>
                <strong>Service class:</strong> `src/services/weather-service.ts` extends `BaseService` and owns the
                browser and API logic.
              </li>
              <li>
                <strong>Profile:</strong> `src/profile.ts` registers the service once, including its configuration.
              </li>
              <li>
                <strong>Consumption:</strong> this screen uses `useService(WEATHER_SERVICE_TOKEN)` to resolve the service.
              </li>
              <li>
                <strong>UI state:</strong> React still owns loading, error, and display state for the current screen.
              </li>
            </ol>

            <div className="file-callouts">
              <article>
                <h3>Good for beginners</h3>
                <p>The service hides geolocation and fetch details, so the React component stays focused on presentation.</p>
              </article>
              <article>
                <h3>Easy to extend</h3>
                <p>You can add forecast data, caching, or another provider later without changing how the UI resolves the service.</p>
              </article>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function describeStatus(status: RequestStatus): string {
  switch (status) {
    case "loading":
      return "Loading";
    case "ready":
      return "Ready";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}

function formatTimestamp(timestamp: string): string {
  const parsedDate = new Date(timestamp);

  if (Number.isNaN(parsedDate.getTime())) {
    return timestamp;
  }

  return parsedDate.toLocaleString();
}

function getTemperatureSymbol(unit: WeatherResult["temperatureUnit"]): string {
  return unit === "fahrenheit" ? "F" : "C";
}
