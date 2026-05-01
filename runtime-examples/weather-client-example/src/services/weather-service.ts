import { BaseService } from "@realitycollective/service-framework";

export interface WeatherServiceConfig {
  readonly temperatureUnit: "celsius" | "fahrenheit";
  readonly endpoint?: string;
}

export interface WeatherResult {
  readonly latitude: number;
  readonly longitude: number;
  readonly temperature: number;
  readonly apparentTemperature: number;
  readonly windSpeed: number;
  readonly weatherCode: number;
  readonly description: string;
  readonly isDay: boolean;
  readonly temperatureUnit: WeatherServiceConfig["temperatureUnit"];
  readonly fetchedAt: string;
}

export class WeatherService extends BaseService<WeatherServiceConfig> {
  public async getCurrentWeather(): Promise<WeatherResult> {
    const position = await this.getCurrentPosition();
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;

    const url = new URL(this.serviceConfig.endpoint ?? "https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day");
    url.searchParams.set("temperature_unit", this.serviceConfig.temperatureUnit);

    const response = await fetch(url.toString(), { signal: this.abortSignal });

    if (!response.ok) {
      throw new Error(`Weather request failed with status ${response.status}.`);
    }

    const payload = await response.json() as {
      readonly current?: {
        readonly time?: string;
        readonly temperature_2m?: number;
        readonly apparent_temperature?: number;
        readonly weather_code?: number;
        readonly wind_speed_10m?: number;
        readonly is_day?: number;
      };
    };

    if (
      payload.current?.temperature_2m === undefined
      || payload.current.apparent_temperature === undefined
      || payload.current.weather_code === undefined
      || payload.current.wind_speed_10m === undefined
      || payload.current.is_day === undefined
    ) {
      throw new Error("Weather response did not include the expected current conditions.");
    }

    return {
      latitude,
      longitude,
      temperature: payload.current.temperature_2m,
      apparentTemperature: payload.current.apparent_temperature,
      windSpeed: payload.current.wind_speed_10m,
      weatherCode: payload.current.weather_code,
      description: describeWeatherCode(payload.current.weather_code),
      isDay: payload.current.is_day === 1,
      temperatureUnit: this.serviceConfig.temperatureUnit,
      fetchedAt: payload.current.time ?? new Date().toISOString()
    };
  }

  private async getCurrentPosition(): Promise<GeolocationPosition> {
    if (!("geolocation" in navigator)) {
      throw new Error("This browser does not support geolocation.");
    }

    return await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 15000
      });
    });
  }
}

function describeWeatherCode(code: number): string {
  switch (code) {
    case 0:
      return "Clear sky";
    case 1:
    case 2:
    case 3:
      return "Partly cloudy";
    case 45:
    case 48:
      return "Fog";
    case 51:
    case 53:
    case 55:
      return "Drizzle";
    case 61:
    case 63:
    case 65:
      return "Rain";
    case 71:
    case 73:
    case 75:
      return "Snow";
    case 80:
    case 81:
    case 82:
      return "Rain showers";
    case 95:
      return "Thunderstorm";
    default:
      return `Weather code ${code}`;
  }
}
