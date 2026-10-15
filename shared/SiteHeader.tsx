import { useSyncExternalStore } from "react";
import {
  activeNavigation,
  navigationHref,
  siteBrand,
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
          {siteBrand.name}
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
        <a
          className="gr-github"
          href={siteBrand.repository}
          target="_blank"
          rel="noreferrer"
        >
          GitHub ↗
        </a>
      </header>
    </div>
  );
}
