import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import AnimationProvider from "./components/AnimationProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary><AnimationProvider><AuthProvider>
        <App />
      </AuthProvider></AnimationProvider></ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
