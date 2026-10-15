import { mockPartB } from "./mockPartB";
import { mockSeedPopulation, mockSeedSession } from "./mockSeed";
export function installMockRoles() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
      location.origin,
    );
    if (url.origin === location.origin && url.pathname === "/api/report")
      return Response.json(mockSeedPopulation());
    if (
      url.origin === location.origin &&
      url.pathname.startsWith("/api/seed-sessions/")
    ) {
      const value = mockSeedSession(
        decodeURIComponent(url.pathname.slice("/api/seed-sessions/".length)),
      );
      return Response.json(value ?? { detail: "Seed session not found" }, {
        status: value ? 200 : 404,
      });
    }
    if (url.origin === location.origin && url.pathname === "/api/partb")
      return new Response(JSON.stringify(mockPartB()), {
        headers: { "Content-Type": "application/json" },
      });
    if (url.origin !== location.origin || url.pathname !== "/roles/assign")
      return original(input, init);
    const count = Number(
      localStorage.getItem("ghost:mock_role_counter") ?? "0",
    );
    localStorage.setItem("ghost:mock_role_counter", String(count + 1));
    return new Response(JSON.stringify({ role: count % 2 ? "B" : "A" }), {
      headers: { "Content-Type": "application/json" },
    });
  };
}
