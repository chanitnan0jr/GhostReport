import logo from "./assets/ghostreport-mark.png";

export const siteBrand = {
  name: "GhostReport",
  href: "/",
  logo,
  repository: "https://github.com/chanitnan0jr/GhostReport",
} as const;

export const siteNavigation = [
  { id: "home", label: "Home", href: "/" },
  { id: "try", label: "Try the App", href: "/try/" },
  { id: "segments", label: "Segments", href: "/report/#segments" },
  { id: "workflow", label: "Workflow Map", href: "/report/#workflow" },
  { id: "report", label: "Report", href: "/report/" },
  { id: "install", label: "Install", href: "/install/" },
] as const;

export function activeNavigation(url: URL): string | null {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/report") {
    if (url.hash === "#segments") return "segments";
    if (url.hash === "#workflow" || url.hash.startsWith("#fact-"))
      return "workflow";
    return "report";
  }
  if (path === "/try" || path === "/app") return "try";
  if (path === "/" || path === "/seed") return "home";
  return (
    siteNavigation.find((item) => item.href.replace(/\/+$/, "") === path)?.id ??
    null
  );
}

export function navigationHref(href: string, current: URL): string {
  if (!href.startsWith("/report/") || !/^\/report\/?$/.test(current.pathname))
    return href;
  const destination = new URL(href, current.origin);
  destination.search = current.search;
  return destination.pathname + destination.search + destination.hash;
}
