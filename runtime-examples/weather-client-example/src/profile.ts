import { createServiceProfile } from "@realitycollective/service-framework";
import { WEATHER_SERVICE_TOKEN } from "./services/tokens.js";
import { WeatherService } from "./services/weather-service.js";

const configuredTemperatureUnit = import.meta.env.VITE_WEATHER_UNIT === "fahrenheit"
  ? "fahrenheit"
  : "celsius";

export const profile = createServiceProfile("weather-client-example", [
  {
    token: WEATHER_SERVICE_TOKEN,
    name: "weather",
    config: {
      temperatureUnit: configuredTemperatureUnit
    },
    useFactory: (context) => new WeatherService(context as ConstructorParameters<typeof WeatherService>[0])
  }
]);
