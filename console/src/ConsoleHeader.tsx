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
  ["Try the App", "/app/"],
  ["Segments", "/report/#segments"],
  ["Workflow Map", "/report/#workflow"],
  ["Report", "/report/"],
  ["ENS", "/ens/"],
] as const;

export function ConsoleHeader({ hash }: { hash: string }) {
  const active =
    hash === "#segments"
      ? "/report/#segments"
      : hash === "#workflow" || hash.startsWith("#fact-")
        ? "/report/#workflow"
        : "/report/";
  return (
    <header className="console-site-header">
      <a href="/" className="brand">
        <span className="brand-icon" aria-hidden="true">
          G
        </span>
        GhostReport
      </a>
      <nav aria-label="Main navigation">
        {links.map(([label, href]) => (
          <a
            key={href}
            href={href}
            aria-current={active === href ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
    </header>
  );
}
