import React from "react";
import {
  BaseService,
  createServiceProfile,
  createServiceToken
} from "@realitycollective/service-framework";
import {
  ServiceFrameworkProvider,
  useService
} from "@realitycollective/service-framework-react";

const STATUS_TOKEN = createServiceToken<StatusService>("StatusService");

class StatusService extends BaseService {
  get message(): string {
    return "React service framework ready";
  }
}

function StatusPanel(): React.JSX.Element {
  const service = useService(STATUS_TOKEN);
  return <p>{service.message}</p>;
}

export function App(): React.JSX.Element {
  return (
    <ServiceFrameworkProvider
      profile={createServiceProfile("react-example", [
        {
          token: STATUS_TOKEN,
          useFactory: (context) => new StatusService(context)
        }
      ])}
    >
      <StatusPanel />
    </ServiceFrameworkProvider>
  );
}
