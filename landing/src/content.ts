export const REPO_URL = "https://github.com/chanitnan0jr/GhostReport";

export const ROLE_CARDS = {
  A: "Role: A team looking for funding. Your team just built a project at this hackathon and wants a small grant from the DAO community to keep going after the event. A friend sent you this app and said applications are open. Find a funding program that fits your team, and decide for yourself whether to apply now. Do what you'd really do. There's no right or wrong answer. About 2 minutes.",
  B: "Role: Someone curious about the community. You've heard this DAO community funds finance projects, and you want to see what projects are out there. You don't have a project of your own to fund right now. Look at whatever interests you, and decide for yourself what to do next in the app. Do what you'd really do. There's no right or wrong answer. About 2 minutes.",
} as const;

export const INTEGRATION_LEVELS = [
  [
    "L0",
    "Read-only code",
    "A repository URL and pinned commit. Get a workflow map and evidence gaps.",
  ],
  [
    "L1",
    "Existing events",
    "Map your analytics events to the canonical schema. Add behavior to the investigation.",
  ],
  [
    "L2",
    "Optional feedback",
    "Embed a skippable question at an eligible exit. Gather evidence from users.",
  ],
  [
    "L3",
    "Reviewed PR",
    "Propose missing instrumentation for a developer to review. Roadmap.",
  ],
] as const;

export const CONFIG_EXAMPLE = `repo:
  url: https://github.com/<owner>/<repo>
  commit: <sha>
  include: ["src/**/*.ts", "src/**/*.tsx"]
workflow:
  name: wallet_onboarding
  keywords: [wallet, connect, requireWallet]
mode: behavioral
events:
  "Project Viewed": project_viewed
  "Apply Clicked": apply_clicked
  "Wallet Gate Shown": wallet_gate_shown
  "Wallet Connect Started": wallet_attempted
  "Wallet Connected": wallet_connected
  "Not Now Clicked": not_now_clicked
  "Back To List": back_nav
requires_seq: true
privacy:
  allowed_props: [project_id, page]
probe:
  delivery: component
  budget: 30
  consent_required: true`;
