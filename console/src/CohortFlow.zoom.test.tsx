import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CohortFlow } from "./CohortFlow";
import type { Session } from "./types";

const population: Session[] = [
  {
    session_id: "s-1",
    cohort: "gate_event_no_attempt",
    coverage: "complete",
    coverage_reasons: [],
    exit_type: "not_now",
    attempt_states: [],
    after_retry: false,
    event_ids: [],
  },
];

function setup() {
  const onSelect = vi.fn();
  const view = render(
    <CohortFlow
      population={population}
      selected={null}
      personal={false}
      onSelect={onSelect}
    />,
  );
  const canvas = screen.getByRole("region", { name: /Recorded workflow/ });
  const svg = canvas.querySelector("svg")!;
  return { ...view, onSelect, canvas, svg };
}

describe("CohortFlow zoom and pan", () => {
  it("zooms with the keyboard, the buttons and the wheel", () => {
    const { canvas, svg } = setup();
    fireEvent.keyDown(canvas, { key: "+" });
    expect(screen.getByRole("button", { name: /Zoom 100%/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(svg.style.transform).toContain("scale(1.25)");
    fireEvent.keyDown(canvas, { key: "-" });
    expect(svg.style.transform).toContain("scale(1)");
    fireEvent.keyDown(canvas, { key: "0" });
    expect(svg.style.transform).toBe("translate(5%, 5%) scale(0.8)");
    fireEvent.wheel(canvas, { deltaY: -200 });
    expect(svg.style.transform).not.toContain("scale(0.8)");
  });

  it("drags the diagram without selecting the node under the pointer", () => {
    const { canvas, svg, onSelect } = setup();
    const node = screen.getByRole("button", { name: /^Rule 3, Gate shown/ });
    fireEvent.pointerDown(node, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { buttons: 1, clientX: 140, clientY: 120 });
    expect(svg.style.transform).not.toBe("translate(5%, 5%) scale(0.8)");
    fireEvent.pointerUp(canvas);
    fireEvent.click(node);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.pointerDown(node, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(node);
    fireEvent.click(node);
    expect(onSelect).toHaveBeenCalledWith("gate_event_no_attempt");
  });
});
