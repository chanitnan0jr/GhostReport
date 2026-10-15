const links = [
  ["DAO", "/"],
  ["Demo User Seed", "/seed/"],
  ["Report", "/report/"],
] as const;

export function SiteHeader({ light = false }: { light?: boolean }) {
  const path = location.pathname.replace(/\/$/, "") || "/";
  return (
    <header className={`global-header${light ? " global-header-light" : ""}`}>
      <a href="/" className="brand">
        <span className="brand-mark" aria-hidden="true">
          {light ? "c." : "G"}
        </span>
        {light ? "common ground" : "GhostReport"}
      </a>
      <nav className="global-nav" aria-label="Main navigation">
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
    </header>
  );
}
