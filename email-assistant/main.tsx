import React from "react";
import { createRoot } from "react-dom/client";
import { EmailQuoteAssistant } from "../app/EmailQuoteAssistant";
import "./quote-assistant.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><EmailQuoteAssistant /></React.StrictMode>);
