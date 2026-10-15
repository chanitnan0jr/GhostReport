import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import sample from "../../fixtures/report.sample.json";
import App from "./App";
import { OperatorBar } from "./OperatorBar";
import { findingLabel, findingText, safeText } from "./format";
import type { Report } from "./types";
import { setOperatorToken } from "./api";

const fixture = () => structuredClone(sample) as Report;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("sample report", () => {
  it("renders all nine panels, a prominent seed badge, H_other and scoped counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => json(fixture())),
    );
    const { container } = render(<App />);
    await screen.findByRole("heading", { name: "Hypothesis Matrix" });
    expect(container.querySelectorAll("[data-panel]")).toHaveLength(9);
    expect(screen.getByText("SEED DATA")).toBeVisible();
    const matrix = container.querySelector("[data-panel=hypotheses]")!;
    expect(within(matrix as HTMLElement).getByText("H_other")).toBeVisible();
    expect(
      within(matrix as HTMLElement).getByText("2 of 3 respondents"),
    ).toBeVisible();
    expect(container.querySelectorAll(".generic")).toHaveLength(2);
    expect(
      screen.queryByLabelText("Digest held outside the system"),
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /\b(?:confirmed|root cause|cause|proved)\b/i,
    );
    expect(container.textContent).not.toMatch(/no tracking/i);
    expect(container.textContent).toContain("not found in searched files");
    expect(screen.getByRole("heading", { name: "Limitations" })).toBeVisible();
    expect(container.querySelector("#limitations details")).toBeNull();
  });

  it("keeps low-n neutral and displays both sides of an evidence conflict", async () => {
    const report = fixture();
    const finding = report.current.findings[0];
    Object.assign(finding, {
      respondents: 2,
      text: "2 of 2 respondents",
      evidence_conflict: true,
      observation: "Contradicted by rule R2",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => json(report)),
    );
    const { container } = render(<App />);
    await screen.findByRole("heading", { name: "Hypothesis Matrix" });
    const row = container.querySelector(".matrix tbody tr")! as HTMLElement;
    expect(within(row).getAllByText("Unresolved")).toHaveLength(2);
    expect(within(row).getByText("2 of 2 respondents")).toBeVisible();
    expect(within(row).getByText("Evidence conflict")).toBeVisible();
    expect(within(row).getByText("Contradicted by rule R2")).toBeVisible();
  });

  it("surfaces API errors and withholds a finding with incorrect count wording", async () => {
    const report = fixture();
    report.current.errors = [
      { reason: "Exposure sequence is not an exit event" },
    ];
    report.current.findings[0].text = "2 of 6 visitors";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => json(report)),
    );
    render(<App />);
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent("Exposure sequence is not an exit event");
    expect(warning).toHaveTextContent("numerator or denominator");
    expect(screen.queryByText("2 of 6 visitors")).not.toBeInTheDocument();
  });

  it("retains the Other row even when the API omits it and flags the omission", async () => {
    const report = fixture();
    report.hypotheses = report.hypotheses.filter((h) => h.id !== "H_other");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => json(report)),
    );
    render(<App />);
    await screen.findByRole("heading", { name: "Hypothesis Matrix" });
    expect(screen.getByRole("alert")).toHaveTextContent("H_other is missing");
    expect(screen.getAllByText("H_other").length).toBeGreaterThan(0);
  });
});

describe("operator actions", () => {
  beforeEach(() => setOperatorToken("test-operator-token"));
  it("locks v1, displays the returned digest and never fills the external input", async () => {
    const report = fixture();
    report.locked = false;
    report.v1 = null;
    const result = {
      version: 1,
      digest: sample.v1.digest,
      data_cutoff: sample.v1.data_cutoff,
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(async (path: string) =>
        json(path === "/api/draft" ? null : result),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <OperatorBar
        report={report}
        refresh={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Lock v1" }));
    await screen.findByText(sample.v1.digest);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lock",
      expect.objectContaining({ method: "POST" }),
    );
    const lockCall = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/lock",
    );
    expect(lockCall?.[1].headers.get("Authorization")).toBe(
      "Bearer test-operator-token",
    );
    expect(screen.getByLabelText("Digest held outside the system")).toHaveValue(
      "",
    );
    expect(
      screen.getByText(
        "Give this digest to a mentor/judge before the first probe",
      ),
    ).toBeVisible();
  });

  it("sends only the operator-provided digest and displays 409 clearly", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json({ detail: "External digest does not match" }, 409),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<OperatorBar report={fixture()} refresh={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: "Lock v1" }),
    ).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Write v2 snapshot" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Digest held outside the system"), {
      target: { value: "operator-pasted-digest" },
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("409"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/snapshot",
      expect.objectContaining({
        body: JSON.stringify({ v1_digest: "operator-pasted-digest" }),
      }),
    );
  });
});

it("hides all operator tools from public visitors and asks once on operator entry", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => json(fixture())),
  );
  const first = render(<App />);
  await screen.findByRole("heading", { name: "Hypothesis Matrix" });
  expect(screen.queryByLabelText("Operator token")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Write v2 snapshot" }),
  ).not.toBeInTheDocument();
  first.unmount();
  history.replaceState(null, "", "/report/?operator=1");
  render(<App />);
  const input = await screen.findByLabelText("Operator token");
  fireEvent.change(input, { target: { value: "memory-only-token" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Unlock operator tools" }),
  );
  expect(
    await screen.findByRole("button", { name: "Write v2 snapshot" }),
  ).toBeVisible();
  expect(screen.queryByLabelText("Operator token")).not.toBeInTheDocument();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

it("highlights the visitor session and renders the supplied event verification", async () => {
  localStorage.setItem("ghost:judge_sid", "s2");
  const value = fixture();
  value.run.mode = "demo";
  value.run.verification = {
    wallet_gate_shown: {
      verified: true,
      test: "gate renders once",
      commit: "abc123",
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => json(value)),
  );
  const { container } = render(<App />);
  await screen.findByRole("heading", { name: "Coverage" });
  expect(screen.getByText("20 seeded sessions + live visitors")).toBeVisible();
  expect(screen.getByText("gate renders once")).toBeVisible();
  expect(container.querySelector(".your-cohort")).toHaveTextContent(
    "Your session",
  );
  expect(
    screen.getByRole("complementary", { name: "Your session" }),
  ).toHaveTextContent("Gate shown, no attempt");
});

it("guards finding text and wording without reclassifying observations", () => {
  const finding = fixture().current.findings[0];
  expect(findingText(finding)).toBe("2 of 3 respondents");
  expect(findingLabel({ ...finding, respondents: 2 })).toBe("Unresolved");
  expect(findingText({ ...finding, selected: 4 })).toBeNull();
  expect(safeText("Confirmed")).toBe("Text withheld by wording guard");
});

it("shows an explicitly unverified event and preserves a dirty commit verbatim", async () => {
  const value = fixture();
  value.run.build_verified = false;
  value.run.code_commit = "abc123-dirty.c5b82c63";
  value.run.verification = {
    wallet_gate_shown: {
      verified: false,
      test: null,
      commit: null,
      passed_at: null,
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => json(value)),
  );
  render(<App />);
  await screen.findByRole("heading", { name: "Coverage" });
  const banner = screen.getByLabelText("Run information");
  expect(banner).toHaveTextContent("Build unverified");
  expect(banner).toHaveTextContent("wallet_gate_shown unverified");
  expect(banner).toHaveTextContent("abc123-dirty.c5b82c63");
  expect(banner).not.toHaveTextContent("verified by");
});
