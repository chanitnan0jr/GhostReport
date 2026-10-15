import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { InstallPage } from "./InstallPage";
import { PartBPage } from "./PartBPage";
import { SeedPage } from "./SeedPage";
import "./styles.css";

async function main() {
  if (import.meta.env.VITE_MOCK === "1")
    (await import("./mocks")).installMockRoles();
  const path = location.pathname.replace(/\/$/, "");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {path === "/ens" ? (
        <PartBPage />
      ) : path === "/seed" ? (
        <SeedPage />
      ) : path === "/install" ? (
        <InstallPage />
      ) : (
        <App page={path === "/about" ? "guide" : "dao"} />
      )}
    </StrictMode>,
  );
}
void main();
