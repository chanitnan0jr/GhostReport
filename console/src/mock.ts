import sample from "../../fixtures/report.sample.json";
import type { Report } from "./types";

/** The shared report fixture is read directly; it is never rewritten. */
export function installMockBackend() {
  const state = structuredClone(sample) as Report;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
      location.origin,
    );
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
      return nativeFetch(input, init);
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.pathname === "/api/report") return json(state);
    if (url.pathname === "/api/lock" && init?.method === "POST") {
      if (!state.v1)
        return json(
          { detail: "Sample does not contain a baseline digest" },
          409,
        );
      state.locked = true;
      return json({
        version: 1,
        digest: state.v1.digest,
        data_cutoff: state.v1.data_cutoff,
      });
    }
    if (url.pathname === "/api/snapshot" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { v1_digest?: string };
      if (!state.v1 || body.v1_digest !== state.v1.digest)
        return json(
          { detail: "External v1 digest does not match the locked baseline" },
          409,
        );
      const snapshot = {
        version: (state.snapshots.at(-1)?.version ?? 1) + 1,
        digest: [...crypto.getRandomValues(new Uint8Array(32))]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join(""),
        data_cutoff: state.current.data_cutoff,
      };
      state.snapshots.push(snapshot);
      return json(snapshot);
    }
    return json({ detail: "Unknown mock endpoint" }, 404);
  };
  return () => {
    window.fetch = nativeFetch;
  };
}
