import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AboutPage } from "./AboutPage";
import App from "./App";
import { HomePage } from "./HomePage";
import { InstallPage } from "./InstallPage";
import { PartBPage } from "./PartBPage";
import { SeedPage } from "./SeedPage";
import "./styles.css";
import "./site.css";

const PAGES: Record<string, () => React.ReactElement> = {
  "": () => <HomePage />,
  "/try": () => <App />,
  "/seed": () => <SeedPage />,
  "/ens": () => <PartBPage />,
  "/install": () => <InstallPage />,
  "/about": () => <AboutPage />,
};

async function main() {
  if (import.meta.env.VITE_MOCK === "1")
    (await import("./mocks")).installMockRoles();
  const path = location.pathname.replace(/\/$/, "");
  const page = PAGES[path] ?? PAGES[""];
  createRoot(document.getElementById("root")!).render(
    <StrictMode>{page()}</StrictMode>,
  );
}
void main();
