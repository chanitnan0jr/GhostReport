import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import EnsSimulation from "./EnsSimulation";
import sample from "./mocks/ensSimulation.sample.json";
import { simulationApi, simulationTokenKey } from "./ensSimulation";

it("creates an isolated simulation, stores only its owner token and opens the report", async () => {
  history.replaceState(null, "", "/report/?project=ens");
  const fetch = vi.fn(
    async (_url: string, init?: RequestInit) =>
      new Response(
        JSON.stringify(
          init?.method === "POST"
            ? {
                simulation_id: sample.simulation_id,
                token: "test-owner",
                report: sample,
              }
            : sample,
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const onCreated = vi.fn();
  render(<EnsSimulation onCreated={onCreated} />);
  fireEvent.click(screen.getByRole("button", { name: "Start ENS simulation" }));
  await screen.findByText(sample.population.text);
  expect(location.search).toContain(`simulation=${sample.simulation_id}`);
  expect(localStorage.getItem(simulationTokenKey(sample.simulation_id))).toBe(
    "test-owner",
  );
  expect(onCreated).toHaveBeenCalledWith(sample.simulation_id);
  expect(
    screen.getByRole("button", { name: "Add simulated load + feedback" }),
  ).toBeVisible();
  expect(screen.getByText(sample.summary)).toBeVisible();
  expect(
    fetch.mock.calls.every(([url]) => String(url).startsWith(simulationApi)),
  ).toBe(true);
});

it("sends the chosen feedback mode and preset with the simulation owner token", async () => {
  history.replaceState(
    null,
    "",
    `/report/?project=ens&simulation=${sample.simulation_id}`,
  );
  localStorage.setItem(simulationTokenKey(sample.simulation_id), "test-owner");
  const fetch = vi.fn(async () => new Response(JSON.stringify(sample)));
  vi.stubGlobal("fetch", fetch);
  render(<EnsSimulation />);
  await screen.findByText(sample.population.text);
  fireEvent.change(screen.getByLabelText("Simulated delivery and feedback"), {
    target: { value: "answered" },
  });
  fireEvent.change(screen.getByLabelText("Answer preset"), {
    target: { value: "permission" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Add simulated load + feedback" }),
  );
  await waitFor(() =>
    expect(
      fetch.mock.calls.some((call) => {
        const [url, init] = call as unknown as [
          string,
          RequestInit | undefined,
        ];
        if (init?.method !== "POST") return false;
        const body = JSON.parse(String(init.body));
        return (
          url === `${simulationApi}/${sample.simulation_id}/load` &&
          new Headers(init.headers).get("Authorization") ===
            "Bearer test-owner" &&
          body.feedback === "answered" &&
          body.preset === "permission" &&
          body.n === 20 &&
          body.batch_id
        );
      }),
    ).toBe(true),
  );
});

it("keeps shared simulations read-only and presents feedback as synthetic", async () => {
  history.replaceState(
    null,
    "",
    `/report/?project=ens&simulation=${sample.simulation_id}`,
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(sample))),
  );
  render(<EnsSimulation />);
  await screen.findByText(sample.population.text);
  expect(
    screen.queryByRole("button", { name: "Add simulated load + feedback" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(
      "Shared read-only simulation. Only its creator can add load.",
    ),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Hypotheses v1 vs current" }),
  ).toBeVisible();
  expect(screen.getAllByText("Unresolved").length).toBeGreaterThan(0);
  expect(screen.getAllByText(sample.findings[0].text).length).toBeGreaterThan(
    0,
  );
  expect(screen.getByRole("heading", { name: "Limitations" })).toBeVisible();
  expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
});

it("reuses the same batch id when retrying an uncertain load request", async () => {
  history.replaceState(
    null,
    "",
    `/report/?project=ens&simulation=${sample.simulation_id}`,
  );
  localStorage.setItem(simulationTokenKey(sample.simulation_id), "test-owner");
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        bodies.push(String(init.body));
        if (bodies.length === 1) throw new Error("Network interrupted");
      }
      return new Response(JSON.stringify(sample));
    }),
  );
  render(<EnsSimulation />);
  await screen.findByText(sample.population.text);
  fireEvent.click(
    screen.getByRole("button", { name: "Add simulated load + feedback" }),
  );
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "Add simulated load + feedback" }),
  );
  await waitFor(() => expect(bodies).toHaveLength(2));
  expect(bodies[0]).toBe(bodies[1]);
});
