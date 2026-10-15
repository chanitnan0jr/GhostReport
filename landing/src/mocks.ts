export function installMockRoles() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
      location.origin,
    );
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
