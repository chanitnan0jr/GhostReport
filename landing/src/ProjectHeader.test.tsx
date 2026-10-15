import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { SiteHeader } from "../../shared/SiteHeader";

it("uses the shared project dropdown and workflow-first navigation", () => {
  history.replaceState(null, "", "/app/");
  render(<SiteHeader />);
  expect(screen.getByRole("combobox", { name: "Project data" })).toHaveValue(
    "app",
  );
  expect(screen.getByRole("link", { name: "DAO Mock" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const links = within(
    screen.getByRole("navigation", { name: "Main navigation" }),
  ).getAllByRole("link");
  expect(links[1]).toHaveTextContent("Workflow Map");
  expect(links[2]).toHaveTextContent("Segments");
});
