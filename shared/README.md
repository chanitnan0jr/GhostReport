# Shared site header

`SiteHeader.tsx` is the single header implementation used by landing, the grant
app and the report console. `navigation.ts` owns menu order, labels, links,
brand artwork and the GitHub URL. `header.css` owns the shared header styling:
a full-width glass surface, the supplied ghost logo and a sans-serif wordmark,
soft mountain artwork, a pale red sun, grouped pill navigation with a white
selected surface and a short blue indicator,
and the GhostReport / DAO Mock switch beside GitHub. The header is 100% wide,
has no maximum width or horizontal gutter, and remains sticky in the console.

`assets/ink-mountains.png` reuses the existing Home artwork unchanged. Vite
bundles it under each frontend's base path so the header works independently
in development. Home references that same shared asset to avoid downloading a
second copy of the background on its first load.

`site-switch.css` styles the website switch independently: equal-width options,
a light recessed track and a raised white selection with blue text. The real
ghost mark and an inline DAO cube replace the status dots. Inactive text uses a
darker slate for contrast. Hover, pressed and keyboard-focus states keep layout
bounds stable. Color/shadow transitions respect reduced-motion preferences.

All frontend UI uses `--gr-font`, the DAO Mock font stack:
`"DM Sans", "Segoe UI", Arial, sans-serif`. Headings use the same family with
lighter weights. This retains the existing system fallback behavior without
adding a remote font dependency. Code, event IDs and technical data keep
`--gr-mono` for readability.

The header derives its active menu from the current URL and subscribes to hash
and browser history changes. A pill switch beside GitHub selects GhostReport or
DAO Mock. DAO Mock links directly to `/app/` and remains active on
`/try/` and `/app/`; other routes select GhostReport. The main menu no longer
contains Try the App. Report selects Segments for `#segments`, Workflow Map for
`#workflow` or `#fact-*`, and Report for other report sections. Legacy `/seed/`
belongs to Home. ENS and About have no matching top-level menu item.

Report-to-report links retain the current query, including `sid`, `operator`
and any existing filters. The header does not read or add operator tokens. Navigation
configuration is static product configuration, not supplied by an engine API.

The logo is imported as an asset so Vite emits the right base-prefixed URL for
each standalone frontend. React resolves from the consuming app via Vite
`resolve.dedupe` and TypeScript `paths`; there is no second React installation
or new package dependency in shared/.

Rebuild each consumer after a shared change:

```sh
npm --prefix landing run build
npm --prefix app run build
npm --prefix console run build
```

The existing root Dockerfile already copies shared/ before the frontend builds.
