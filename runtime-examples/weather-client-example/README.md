# Weather Client Example

Runnable React + TypeScript weather client built on the Reality Collective Service Framework.

This example is the executable version of the weather walkthrough in:

- `documentation/Weather-Client-Walkthrough.md`

It demonstrates:

- defining a service token
- implementing a `WeatherService` with `BaseService`
- registering that service in a profile
- resolving the service in React with `useService`
- asking the browser for geolocation and fetching current weather data from Open-Meteo

## Packages used

- `@realitycollective/service-framework`
- `@realitycollective/service-framework-react`

## Local development

From this folder:

```powershell
npm install
npm run dev
```

The dev server runs at:

`https://localhost:5174`

`http://localhost:5174` also works if HTTPS is disabled by your local Vite setup, but HTTPS is preferred when testing browser location behavior outside localhost.

## Build

```powershell
npm run build
```

Static output is written to:

`dist`

## Preview

```powershell
npm run preview
```

The preview server runs at:

`https://localhost:4174`

## Local HTTPS deployment test

To build and serve the app from `dist` over a self-signed HTTPS endpoint:

```powershell
npm run serve:https
```

The local HTTPS server runs at:

`https://localhost:4174`

## Environment variables

Create `.env.local` to override defaults:

```text
VITE_APP_TITLE=Service Framework Weather Client
VITE_WEATHER_UNIT=fahrenheit
```

If `VITE_WEATHER_UNIT` is omitted, the example defaults to `celsius`.

## Notes

- Open-Meteo does not require an API key for this example.
- Browser geolocation normally requires a secure context in production.
- `localhost` is treated as secure by modern browsers during development.
