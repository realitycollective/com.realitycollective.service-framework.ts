import { createServiceToken } from "@realitycollective/service-framework";
import type { WeatherService } from "./weather-service.js";

export const WEATHER_SERVICE_TOKEN = createServiceToken<WeatherService>("WeatherService");
