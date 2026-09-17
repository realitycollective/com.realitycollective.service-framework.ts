# @realitycollective/service-framework-client

**A pre-wired React and three.js client** for the Reality Collective TypeScript Service Framework. The React bindings and the three.js render bridge are already connected. Your app starts from a working runtime instead of assembling the scheduler and bridge by hand.

```sh
npm install @realitycollective/service-framework-client
```

It depends on the core, the React bindings and the three.js bridge, and re-exports all three. Installing this one package is enough.

## What it composes

| Area | Detail |
| --- | --- |
| **Runtime** | Owns the service manager, the scheduler and the render loop, and starts them in the right order |
| **Profile** | A starting list of services you add your own to |
| **Services** | The services most client apps need anyway, already registered |
| **React** | The React provider, already pointed at that runtime |
| **Tokens** | The lookup keys for those built-in services |

## When to use it

- **Use this** when you are building a React + three.js client and want the standard wiring.
- **Use the core plus a single binding** when you need a different host, or want to own the composition yourself.

## Peer dependency

`react ^19.2.0`.

## Live examples

- Weather client walkthrough: **[service-framework-weather.pages.dev](https://service-framework-weather.pages.dev)**
- Client runtime reference: **[service-framework-client-app.pages.dev](https://service-framework-client-app.pages.dev)**

## Documentation

The [Weather Client Walkthrough](https://github.com/realitycollective/com.realitycollective.service-framework.ts/blob/main/documentation/Weather-Client-Walkthrough.md) builds a deployable app on this package step by step. Runnable apps live in the repository's `runtime-examples/` folder, and a focused example ships in this package's `Examples/` folder.

## License

MIT - see [LICENSE](./LICENSE).
