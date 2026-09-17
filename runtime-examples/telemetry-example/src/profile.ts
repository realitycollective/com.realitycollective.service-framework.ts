import type { ServiceProfile, ServiceRegistration } from "@realitycollective/service-framework";
import {
  CALIBRATION,
  CalibrationService,
  DeviceGatewayService,
  GATEWAY,
  INGEST,
  IngestService,
  type GatewayConfig
} from "./services/services.js";

/**
 * Priority decides activation order, ascending. The gateway comes up first so
 * that when calibration fails the services before it are already live - which
 * is what makes the failure confusing without a record of it.
 */
export function createProfile(config: GatewayConfig): ServiceProfile {
  const services: ServiceRegistration[] = [
    { token: GATEWAY, name: "gateway", priority: 10, config, useClass: DeviceGatewayService },
    { token: INGEST, name: "ingest", priority: 20, config, dependencies: [GATEWAY], useClass: IngestService },
    { token: CALIBRATION, name: "calibration", priority: 30, config, useClass: CalibrationService }
  ] as unknown as ServiceRegistration[];

  return { name: "sensor-gateway", services };
}
