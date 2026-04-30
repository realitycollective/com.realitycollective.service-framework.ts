import type { ServiceProfile, ServiceRegistration } from "./contracts.js";

export function createServiceProfile(name: string, services: readonly ServiceRegistration[]): ServiceProfile {
  return {
    name,
    services
  };
}
