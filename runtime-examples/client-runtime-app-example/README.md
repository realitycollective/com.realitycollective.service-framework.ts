# Client Runtime App

Standalone runtime client application built on the Reality Collective TypeScript Service Framework packages.

## Purpose

This folder is intended to be moved into its own repository later as a complete client application.

For now it consumes the local framework packages using `file:` dependencies:

- `@realitycollective/service-framework`
- `@realitycollective/service-framework-react`
- `@realitycollective/service-framework-three`
- `@realitycollective/service-framework-client`

Because this app now lives under `runtime-examples/`, its local package references point up two levels to the root `packages/` folder.

## Local development

From this folder:

```powershell
npm install
npm run dev
```

The dev server runs at:

`http://localhost:5173`

## Build

```powershell
npm run build
```

Static output is written to:

`dist`

## Preview the built app locally

```powershell
npm run preview
```

The preview server runs at:

`http://localhost:4173`

## Local HTTPS deployment test

To test the built client on a local HTTPS endpoint:

```powershell
npm run serve:https
```

This builds the app and serves `dist` with a self-signed certificate at:

`https://localhost:4173`

## Environment variables

Create `.env.local` to override defaults:

```text
VITE_APP_TITLE=Service Framework Client Runtime
VITE_AI_ENDPOINT=https://localhost:3000/chat
```

If `VITE_AI_ENDPOINT` is omitted, the app uses the built-in mock backend adapter.

If the browser warns about the certificate, accept the local self-signed certificate for testing only.
