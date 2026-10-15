import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { PartBPage } from "./PartBPage";
import "./styles.css";

async function main() {
  if (import.meta.env.VITE_MOCK === "1")
    (await import("./mocks")).installMockRoles();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {location.pathname.replace(/\/$/, "") === "/ens" ? (
        <PartBPage />
      ) : (
        <App />
      )}
    </StrictMode>,
  );
}
void main();
