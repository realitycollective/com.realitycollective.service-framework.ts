import React from "react";
import ReactDOM from "react-dom/client";
import { ServiceFrameworkProvider } from "@realitycollective/service-framework-react";
import { App } from "./App.js";
import { profile } from "./profile.js";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ServiceFrameworkProvider profile={profile}>
      <App />
    </ServiceFrameworkProvider>
  </React.StrictMode>
);
