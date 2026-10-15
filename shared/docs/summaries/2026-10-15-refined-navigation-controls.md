# Refined navigation and website switch

## Changes

- Main navigation is a quiet grouped pill with a white selected surface,
  short blue indicator, consistent spacing and stable label weights.
- Website switch has equal-width options, a blue selected surface and small
  visual status dots. Both control groups share their height and surface tokens.
- Added hover/pressed states, preserved visible focus and 44px link targets,
  and disabled color/shadow transitions under reduced motion.
- Existing full-width header, logo, DAO font stack, labels, URLs, query handling
  and sticky behavior remain in use. Only shared CSS/documentation changed.

## Skills and design decisions

- User selected ui-ux-pro-max and UI-UX-Design after the Superdesign login gate.
  Used their local design-system and navigation/accessibility guidance directly.
- Ran the ui-ux-pro-max design-system and UX searches. UI-UX-Design contains its
  guidance file without a separate search script, so used the available sibling
  search engine. Kept the user-selected DAO font and blue palette over generic
  search recommendations. No remote design generation or new assets required.

## Validation

- Landing, app and console TypeScript/Vite builds passed. Landing initially
  encountered a concurrent HomeDemo export/props mismatch; rerunning after those
  files became consistent passed without changing that session's files.
- Reviewed localhost at 1280px and 1920px. No overlapping header regions,
  horizontal overflow or page errors. Both website options have equal widths.
- Navigation to Workflow Map preserves sid and updates aria-current; DAO Mock
  opens /app/ and selects the correct website. Keyboard focus has a visible 2px
  outline; reduced motion results in a 0s transition.
- Calculated text contrast: inactive slate on the pale surface 5.81:1, active
  navigation text on white 6.70:1, white on selected blue 5.17:1.
- Refreshed local Docker frontend bundles. No unit/E2E suites added or run.
  No dependency changes or remote deployment. Mobile/dark mode out of scope.

## Scope and recovery

- Low-risk CSS-only visual change; staged only shared header CSS, README and this
  summary. Concurrent landing, console, engine and test work was left unstaged.
- Used agentic-workflow module scoping. No push. Recovery is a scoped revert,
  frontend rebuild and local static refresh; rollback not rehearsed.
