import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AboutPage } from "./AboutPage";
import { HomePage } from "./HomePage";
import { InstallPage } from "./InstallPage";
import { PartBPage } from "./PartBPage";
import "./styles.css";
import "./site.css";
import "./explore-cards.css";

const PAGES: Record<string, () => React.ReactElement> = {
  "": () => <HomePage />,
  "/ens": () => <PartBPage />,
  "/install": () => <InstallPage />,
  "/about": () => <AboutPage />,
};

async function main() {
  const path = location.pathname.replace(/\/$/, "");
  if (path === "/try") {
    location.replace(`/app/${location.search}${location.hash}`);
    return;
  }
  if (import.meta.env.VITE_MOCK === "1")
    (await import("./mocks")).installMockRoles();
  const page = PAGES[path] ?? PAGES[""];
  createRoot(document.getElementById("root")!).render(
    <StrictMode>{page()}</StrictMode>,
  );
}
void main();
