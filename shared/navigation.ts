import logo from "./assets/ghostreport-mark.png";

export const siteBrand = {
  name: "GhostReport",
  href: "/",
  logo,
  repository: "https://github.com/chanitnan0jr/GhostReport",
} as const;

export const siteNavigation = [
  { id: "home", label: "Home", href: "/" },
  { id: "workflow", label: "Workflow Map", href: "/report/#workflow" },
  { id: "segments", label: "Segments", href: "/report/#segments" },
  { id: "report", label: "Report", href: "/report/" },
  { id: "sandbox", label: "Sandbox", href: "/sandbox/" },
  { id: "install", label: "Install", href: "/install/" },
  { id: "dao", label: "DAO Mock", href: "/app/" },
] as const;

export type Project = "app" | "ens";

export function activeSite(url: URL): Project {
  return url.searchParams.get("project") === "ens" ? "ens" : "app";
}

export function projectHref(project: Project, current: URL): string {
  const destination = new URL(current);
  if (project === "ens") {
    destination.searchParams.set("project", "ens");
    destination.searchParams.delete("sandbox");
    destination.searchParams.delete("operator");
    if (/^\/(app|try|sandbox)(\/|$)/.test(destination.pathname)) {
      destination.pathname = "/report/";
      destination.hash = "#workflow";
      destination.searchParams.delete("sid");
    }
  } else destination.searchParams.delete("project");
  return destination.pathname + destination.search + destination.hash;
}

export function activeNavigation(url: URL): string | null {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/report") {
    if (url.hash === "#segments") return "segments";
    if (url.hash === "#workflow" || url.hash.startsWith("#fact-"))
      return "workflow";
    return "report";
  }
  if (path === "/" || path === "/seed") return "home";
  return (
    siteNavigation.find((item) => item.href.replace(/\/+$/, "") === path)?.id ??
    null
  );
}

export function navigationHref(href: string, current: URL): string {
  const destination = new URL(href, current.origin);
  if (href.startsWith("/app/")) return href;
  if (href.startsWith("/report/") && /^\/report\/?$/.test(current.pathname))
    destination.search = current.search;
  if (activeSite(current) === "ens") {
    destination.searchParams.set("project", "ens");
    destination.searchParams.delete("sandbox");
    destination.searchParams.delete("operator");
  }
  return destination.pathname + destination.search + destination.hash;
}
