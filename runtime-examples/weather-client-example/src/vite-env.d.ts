/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly VITE_WEATHER_UNIT?: "celsius" | "fahrenheit";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
