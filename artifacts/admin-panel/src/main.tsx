import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Prevent noisy runtime-errors overlay from showing when requests are aborted.
// React Query cancels queries via AbortController, which can trigger an unhandled rejection.
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;

  // Some runtimes provide the DOMException directly (with name AbortError).
  if (
    reason &&
    typeof reason === "object" &&
    (reason as any).name === "AbortError"
  ) {
    event.preventDefault();
    return;
  }

  // Some environments surface the abort as a plain string.
  if (typeof reason === "string" && reason.toLowerCase().includes("signal is aborted")) {
    event.preventDefault();
    return;
  }
});

createRoot(document.getElementById("root")!).render(<App />);
