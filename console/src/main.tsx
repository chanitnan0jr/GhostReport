import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

async function main() {
  if (import.meta.env.VITE_MOCK === "1") {
    const { installMockBackend } = await import("./mock");
    installMockBackend();
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void main();
