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
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6.2 0C6.6 2.8 5.6 3.1 5.6 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.2 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
          </svg>
          GitHub ↗
        </a>
      </header>
    </div>
  );
}
