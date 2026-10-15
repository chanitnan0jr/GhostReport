import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import App from "./App";
import { REPO_URL, ROLE_CARDS } from "./content";

it("shows the three steps, integration levels, example config and real repo links", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: "Try the app as a user" }),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "See the investigation update" }),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Add it to your repo" }),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: /Open the investigation/ }),
  ).toHaveAttribute("href", "/report/");
  expect(screen.getByRole("link", { name: /View on GitHub/ })).toHaveAttribute(
    "href",
    REPO_URL,
  );
  expect(screen.getByText("L0")).toBeInTheDocument();
  expect(screen.getByText("L3")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Tested on a real repo: ENS/ }),
  ).toHaveAttribute("href", "/ens/");
  expect(screen.getByText(/The wallet is simulated/)).toHaveTextContent(
    "A network error may be simulated once.",
  );
});

it.each(["A", "B"] as const)(
  "assigns role %s through the roles endpoint and shows only the exact card plus Start",
  async (role) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ role })));
    vi.stubGlobal("fetch", fetchMock);
    const navigate = vi.fn();
    render(<App navigate={navigate} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Try the app as a user" }),
    );
    await screen.findByRole("button", { name: "Start" });
    expect(screen.getByRole("main").textContent).toBe(
      ROLE_CARDS[role] + "Start",
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/roles/assign");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(Object.keys(body)).toEqual(["session_id"]);
    expect(localStorage.getItem("ghost:judge_sid")).toBe(body.session_id);
    expect(localStorage.length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(navigate).toHaveBeenCalledWith(
      `/app/?sid=${encodeURIComponent(body.session_id)}`,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);

it("retries a failed assignment with the same session ID and does not show an invented card", async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(new Response(JSON.stringify({ role: "A" })));
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: "Try the app as a user" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Please try again",
  );
  expect(localStorage.getItem("ghost:judge_sid")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Try the app as a user" }),
  );
  await screen.findByRole("button", { name: "Start" });
  expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
});

it("fails with a retry path for an invalid assignment", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response('{"role":"unknown"}')),
  );
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: "Try the app as a user" }),
  );
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Try the app as a user" }),
    ).toBeEnabled(),
  );
  expect(
    screen.queryByRole("button", { name: "Start" }),
  ).not.toBeInTheDocument();
});
