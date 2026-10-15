import { useEffect, useState } from "react";

export function useConsoleHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const update = () => setHash(location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return hash;
}

const links = [
  ["Home", "/"],
  ["Demo", "/seed/"],
  ["Try the App", "/try/"],
  ["Segments", "/report/#segments"],
  ["Workflow Map", "/report/#workflow"],
  ["Report", "/report/"],
  ["ENS", "/ens/"],
  ["Install", "/install/"],
  ["About", "/about/"],
] as const;

function navigationHref(href: string): string {
  if (!href.startsWith("/report/")) return href;
  const [path, hash] = href.split("#");
  return `${path}${location.search}${hash ? `#${hash}` : ""}`;
}

export function ConsoleHeader({ hash }: { hash: string }) {
  const active =
    hash === "#segments"
      ? "/report/#segments"
      : hash === "#workflow" || hash.startsWith("#fact-")
        ? "/report/#workflow"
        : "/report/";
  return (
    <div className="console-header-surface">
      <header className="gr-header">
        <a href="/" className="gr-brand">
          <span className="gr-brand-mark" aria-hidden="true">
            G
          </span>
          GhostReport
        </a>
        <nav className="gr-nav" aria-label="Main navigation">
          {links.map(([label, href]) => (
            <a
              key={href}
              href={navigationHref(href)}
              aria-current={active === href ? "page" : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
        <a
          className="gr-github"
          href="https://github.com/chanitnan0jr/GhostReport"
          target="_blank"
          rel="noreferrer"
        >
          GitHub ↗
        </a>
      </header>
    </div>
  );
}
