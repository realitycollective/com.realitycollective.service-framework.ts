# Reality Collective Service Framework for TypeScript

This workspace contains a TypeScript-first implementation of the Reality Collective Service Framework, built as a centralized core runtime with thin host integrations for React and three.js.

## Packages

- `packages/service-framework` - core runtime, DI, lifecycle, modules, events, schedulers, configuration
- `packages/service-framework-react` - React provider and hooks
- `packages/service-framework-three` - three.js render-loop bridge

## Documentation

See `documentation\` for:

- design
- implementation and usage
- Unity to web migration guidance

## Examples

See `packages\service-framework\Examples\` for:

- base web
- React
- three.js
- React + three.js
