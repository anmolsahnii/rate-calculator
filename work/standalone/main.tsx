import React from "react";
import { createRoot } from "react-dom/client";
import { RateCalculator } from "../../app/RateCalculator";
import "../../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RateCalculator />
  </React.StrictMode>,
);
