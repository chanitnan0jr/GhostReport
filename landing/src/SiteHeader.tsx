import { REPO_URL } from "./content";

// Pitch order; console/ and app/ use the same tabs (shared/tokens.css .gr-header).
export const links = [
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

export function SiteHeader() {
  const path = location.pathname.replace(/\/$/, "") || "/";
  return (
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
            href={href}
            aria-current={
              path === (href.replace(/\/$/, "") || "/") ? "page" : undefined
            }
          >
            {label}
          </a>
        ))}
      </nav>
      <a className="gr-github" href={REPO_URL} target="_blank" rel="noreferrer">
        GitHub ↗
      </a>
    </header>
  );
}
