import sample from "../../fixtures/report.sample.json" with { type: "json" };

const sessions = sample.current.sessions.map((session, index) => ({
  ...session,
  session_id: `seed-preview-${index + 1}`,
}));
export function mockSeedPopulation() {
  return {
    current: {
      sessions,
      session_sources: Object.fromEntries(
        sessions.map((session) => [session.session_id, "seed"]),
      ),
    },
  };
}
export function mockSeedSession(id: string) {
  const session = sessions.find((value) => value.session_id === id);
  if (!session) return null;
  const gated = session.cohort === "gate_event_no_attempt";
  const events = gated
    ? [
        "project_viewed",
        "apply_clicked",
        "wallet_gate_shown",
        "not_now_clicked",
      ]
    : ["project_viewed", "back_nav"];
  return {
    ...session,
    source: "seed",
    events: events.map((event, index) => ({
      seq: index + 1,
      event,
      page: gated && index > 1 ? "ApplyModal" : "ProjectPage",
      received_at: new Date(
        Date.UTC(2026, 9, 15, 5, 0, index * 3),
      ).toISOString(),
    })),
    probe: null,
  };
}
