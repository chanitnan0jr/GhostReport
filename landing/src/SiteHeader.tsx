import { REPO_URL } from "./content";

// The demo lives on Home; detailed recordings remain available at /seed/.
export const links = [
  ["Home", "/"],
  ["Try the App", "/try/"],
  ["Segments", "/report/#segments"],
  ["Workflow Map", "/report/#workflow"],
  ["Report", "/report/"],
  ["Install", "/install/"],
] as const;

export function SiteHeader() {
  const path = location.pathname.replace(/\/$/, "") || "/";
  return (
    <header className="gr-header">
      <a href="/" className="gr-brand">
        <img
          className="gr-brand-mark gr-brand-logo"
          src="/images/ghostreport-mark.png"
          width="30"
          height="30"
          alt=""
          aria-hidden="true"
        />
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
