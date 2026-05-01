# Reality Collective Service Framework for TypeScript

This workspace contains a TypeScript-first implementation of the Reality Collective Service Framework, built as a centralized core runtime with thin host integrations for React and three.js.

## Packages

- `packages/service-framework` - core runtime, DI, lifecycle, modules, events, schedulers, configuration
- `packages/service-framework-react` - React provider and hooks
- `packages/service-framework-three` - three.js render-loop bridge
- `packages/service-framework-client` - base client composition package for React + three.js service-driven apps

## Documentation

See `documentation\` for:

- `Design.md` - architecture and design decisions for the TypeScript framework
- `Web-Implementation-and-Usage.md` - beginner-oriented guide to architecture, service authoring, service consumption, and a full weather app walkthrough
- `Migration-Unity-to-Web.md` - concept mapping for moving from the Unity framework to the web runtime

## Examples

See `packages\service-framework\Examples\` for:

- base web
- React
- three.js
- React + three.js

See `runtime-examples\` for runnable standalone apps:

- `client-runtime-app-example`
- `weather-client-example`
