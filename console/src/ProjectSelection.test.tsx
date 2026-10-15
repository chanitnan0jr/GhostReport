import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "../../shared/SiteHeader";
import {
  activeNavigation,
  navigationHref,
  projectHref,
} from "../../shared/navigation";
import App from "./App";

describe("project-scoped navigation", () => {
  it("reorders navigation and underlines DAO Mock on its app", () => {
    history.replaceState(null, "", "/app/");
    render(<SiteHeader />);
    const links = within(
      screen.getByRole("navigation", { name: "Main navigation" }),
    ).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "Home",
      "Workflow Map",
      "Segments",
      "Report",
      "Sandbox",
      "Install",
      "DAO Mock",
    ]);
    expect(screen.getByRole("link", { name: "DAO Mock" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("combobox", { name: "Project data" })).toHaveValue(
      "app",
    );
  });
  it("keeps the project and operator mode in report links, removes ENS sandbox context", () => {
    const current = new URL(
      "https://ghost.test/report/?sandbox=sbx-aaaaaaaaaaaaaaaa&operator=1&project=ens#segments",
    );
    expect(navigationHref("/report/#workflow", current)).toBe(
      "/report/?operator=1&project=ens#workflow",
    );
    expect(navigationHref("/install/", current)).toBe("/install/?project=ens");
    expect(navigationHref("/app/", current)).toBe("/app/");
    expect(
      projectHref(
        "app",
        new URL("https://ghost.test/report/?project=ens#segments"),
      ),
    ).toBe("/report/#segments");
    expect(
      projectHref("ens", new URL("https://ghost.test/app/?sid=visitor")),
    ).toBe("/report/?project=ens#workflow");
    expect(activeNavigation(new URL("https://ghost.test/app/"))).toBe("dao");
  });
  it("shows ENS empty journeys without fetching a mock report or exposing operator tools", async () => {
    history.replaceState(null, "", "/report/?project=ens&operator=1#segments");
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          project: "ens",
          status: "ready",
          validation: [],
          stale: false,
          draft: null,
          approved: null,
          comparison: null,
          template: null,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    await screen.findByText(/No validated ENS journey draft is available/);
    expect(
      fetch.mock.calls.every(([url]) =>
        String(url).includes("/api/journeys/spec?project=ens"),
      ),
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Generate user journeys" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sandbox" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Operator token")).not.toBeInTheDocument();
  });
});
