import { useSyncExternalStore } from "react";
import {
  activeNavigation,
  activeSite,
  navigationHref,
  siteBrand,
  siteDestinations,
  siteNavigation,
} from "./navigation";
import "./header.css";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}
const getLocation = () => window.location.href;

export function SiteHeader({
  surfaceClassName = "",
}: {
  surfaceClassName?: string;
}) {
  const location = useSyncExternalStore(
    subscribe,
    getLocation,
    () => "http://localhost/",
  );
  const current = new URL(location);
  const active = activeNavigation(current);
  const destination = activeSite(current);
  return (
    <div className={`gr-site-header-surface ${surfaceClassName}`.trim()}>
      <header className="gr-header gr-shared-header">
        <a href={siteBrand.href} className="gr-brand">
          <img
            className="gr-brand-mark gr-brand-logo"
            src={siteBrand.logo}
            width="30"
            height="30"
            alt=""
            aria-hidden="true"
          />
          <span className="gr-brand-copy">
            <span className="gr-brand-kicker" aria-hidden="true">
              ゴーストレポート
            </span>
            <span>{siteBrand.name}</span>
          </span>
        </a>
        <nav className="gr-nav" aria-label="Main navigation">
          {siteNavigation.map((item) => (
            <a
              key={item.id}
              href={navigationHref(item.href, current)}
              aria-current={active === item.id ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="gr-header-actions">
          <nav className="gr-site-switch" aria-label="Website switch">
            {siteDestinations.map((item) => (
              <a
                key={item.id}
                href={item.href}
                aria-current={destination === item.id ? "true" : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <a
            className="gr-github"
            href={siteBrand.repository}
            target="_blank"
            rel="noreferrer"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
            </svg>
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>
    </div>
  );
}
