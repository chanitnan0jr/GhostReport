# Shared site header

`SiteHeader.tsx` is the single header implementation used by landing, the grant
app and the report console. `navigation.ts` owns menu order, labels, links,
brand artwork and the GitHub URL. `header.css` owns the shared header styling: a floating glass surface, serif
wordmark with the supplied ghost logo, centered navigation and an active underline.

The header derives its active menu from the current URL and subscribes to hash
and browser history changes. `/try/` and all hash routes under `/app/` select
Try the App. Report selects Segments for `#segments`, Workflow Map for
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
