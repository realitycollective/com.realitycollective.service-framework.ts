# @realitycollective/service-framework-react

**React bindings** for the Reality Collective TypeScript Service Framework - a provider that owns the `ServiceManager` and hooks that resolve services by token.

```sh
npm install @realitycollective/service-framework @realitycollective/service-framework-react
```

## API

| Export | Purpose |
| --- | --- |
| `ServiceFrameworkProvider` | Owns a `ServiceManager` for the React tree below it |
| `useServiceManager()` | The manager itself, for imperative work |
| `useService(token, name?)` | Resolve a single service by token |
| `useServices(token)` | Resolve every service registered under a token |

## Usage

```tsx
import { ServiceFrameworkProvider, useService } from "@realitycollective/service-framework-react";
import { weatherToken } from "./tokens";

function Forecast() {
  const weather = useService(weatherToken);
  return <p>{weather.summary}</p>;
}

export function App() {
  return (
    <ServiceFrameworkProvider profile={myProfile}>
      <Forecast />
    </ServiceFrameworkProvider>
  );
}
```

## Peer dependency

`react ^19.2.0`.

## Live examples

- Weather client walkthrough: **[service-framework-weather.pages.dev](https://service-framework-weather.pages.dev)**
- Client runtime reference: **[service-framework-client-app.pages.dev](https://service-framework-client-app.pages.dev)**

## Documentation

See the [repository README](https://github.com/realitycollective/com.realitycollective.service-framework.ts#readme) and this package's `Examples/` folder.

## License

MIT - see [LICENSE](./LICENSE).
