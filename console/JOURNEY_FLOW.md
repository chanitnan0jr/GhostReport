# Journey flowchart and segment cards

Standalone frontend component for the separate page/navigation owner.
No page, navigation, backend, cohort rule or v1 snapshot is changed here.

## Integrate

In a console component:

```tsx
import { JourneyFlow } from "./JourneyFlow";

// All sources: counts match the report's current recorded population.
<JourneyFlow />

// Seed-only view: GET /api/journeys?source=seed.
<JourneyFlow source="seed" />
```

`JourneyFlow` fetches the public relative endpoint immediately, then refreshes
three seconds after each request finishes. Requests do not overlap; unmount
aborts the current request. Failures show a warning and retain the last valid
graph. Changing `source` resets the view so the previous population is not
displayed under a new filter.

If the page already fetches the graph or supplies its own mock:

```tsx
import { JourneyDiagram } from "./JourneyFlow";
import { validateJourneys, type JourneyGraph } from "./journeys";

validateJourneys(graph);
return <JourneyDiagram graph={graph} />;
```

The renderer has no network requests. Its CSS is imported by the component
and uses `journey-` selectors, so it needs no changes to the shared stylesheet.
Landing can also import the renderer using
`../../console/src/JourneyFlow` from a file in `landing/src/`; its data types
and validation helper live beside the component. For this cross-app import,
the host Vite config must use `resolve: { dedupe: ["react", "react-dom"] }`
to avoid loading a second React copy from console's node_modules. No extra
package is needed. The host config is left to the separate frontend owner.

## Contract and behavior

Uses the exact `GET /api/journeys` shape implemented in
`engine/journeys.py` at `a3c5cfb`:

- Graph: columns, nodes, edges, sessions, by_source, only, notes.
- Segments: id, segment, label, definition, sessions, by_source, probe,
  cohorts, coverage, top_paths.
- Segment keys: browsers, stalled_at_wallet, connected.

The three segment cards sit below the left-to-right SVG flowchart. Each
shows its population denominator, seed/test/visitor split, definition,
`Asked: DP1/DP2/—`, original cohort breakdown, coverage and top paths.
Paths start with `N×`, also include `k of n sessions`, and render step chips
joined by arrows. All labels and counts come from the API.

Clicking a card highlights the matching segment node and its incoming
edges. Clicking it again clears the selection. Cards are keyboard buttons
with a pressed state, an explicit highlight label and a visible focus ring.
Selection persists during refreshes. The chart scrolls inside its own
container; the cards stack on smaller screens. Reduced motion is respected.

All three segment nodes are rendered even when a segment has zero sessions;
zero counts come from `segments[]`, without fabricating edges. API failures
and an empty population have distinct visible states.

The API adapter checks that source splits add up, the three segments sum
to the reported population, and each segment matches its cohort/coverage
totals and graph node. Inconsistent responses are withheld. A decision-point
label is not presented as evidence that every segment session was asked.

No role data, individual session IDs, event ingestion, LLM requests or
production browser automation is added.

## Validation and remaining work

`npm run build` in console passed (TypeScript includes these source files).
Unit/browser tests were not added or run for this change. The component is
not mounted in a page here; the frontend page owner should choose the host,
connect its mock response if needed, and perform rendered integration checks.

Local module commit includes only the new component, CSS, API types/helper
and this handoff. Other session's page/navigation edits are excluded. No push.

Workflow: agentic-workflow for scope and commit isolation; UI-UX-Design for
keyboard access, responsive navigation/diagram controls and focus states;
React best practices for abortable requests and bounded polling.
