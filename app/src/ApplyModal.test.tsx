import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ApplyModal } from "./ApplyModal";
import projects from "./data/projects.json";
import { createTracker } from "./track";

it("fires gate exposure once per display, including StrictMode and forced rerenders", () => {
  const tracker = createTracker({ sessionId: "s_gate", autoFlush: false });
  const props = {
    project: projects[0],
    tracker,
    wallet: null,
    displayId: "display1",
    error: "",
    onConnect: vi.fn(),
    onNotNow: vi.fn(),
    onClose: vi.fn(),
  };
  const { rerender, unmount } = render(
    <StrictMode>
      <ApplyModal {...props} />
    </StrictMode>,
  );
  rerender(
    <StrictMode>
      <ApplyModal {...props} error="New parent state" />
    </StrictMode>,
  );
  rerender(
    <StrictMode>
      <ApplyModal {...props} />
    </StrictMode>,
  );
  expect(
    tracker.pending().filter((e) => e.event === "wallet_gate_shown"),
  ).toHaveLength(1);
  unmount();
  render(
    <StrictMode>
      <ApplyModal {...props} displayId="display2" />
    </StrictMode>,
  );
  expect(
    tracker.pending().filter((e) => e.event === "wallet_gate_shown"),
  ).toHaveLength(2);
});
