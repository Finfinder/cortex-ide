import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/components/Theme";
import App from "./App";
import "@/styles/global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
