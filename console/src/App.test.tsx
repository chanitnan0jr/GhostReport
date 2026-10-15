import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import documentSample from "../../fixtures/report.document.sample.json";
import sample from "../../fixtures/report.sample.json";
import App from "./App";
import { OperatorBar } from "./OperatorBar";
import { findingLabel, findingText, safeText } from "./format";
import type { ReportDocument } from "./reportDocument";
import type { Report } from "./types";
import { setOperatorToken } from "./api";

const fixture = () => structuredClone(sample) as Report;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const FORBIDDEN = /\b(?:confirmed|root cause|cause|proved)\b/i;
const TITLE = "Investigating wallet onboarding drop-off";

const documentFixture = () =>
  structuredClone(documentSample) as unknown as ReportDocument;
// /api/report/document serves the engine-generated document; every other path the report.
function api(
  report: Report = fixture(),
  doc: ReportDocument = documentFixture(),
) {
  return vi
    .fn()
    .mockImplementation(async (input: RequestInfo | URL) =>
      json(String(input).endsWith("/api/report/document") ? doc : report),
    );
}

describe("investigation document", () => {
  beforeEach(() => history.replaceState(null, "", "/report/"));

  it("renders one document with contents, numbered citations and its checks", async () => {
    vi.stubGlobal("fetch", api());
    const { container } = render(<App />);
    await screen.findByRole("heading", { level: 1, name: TITLE });
    expect(screen.getByText("SEED DATA")).toBeVisible();
    expect(screen.getByText("Template · Facts checked")).toBeVisible();
    const contents = screen.getByRole("navigation", {
      name: "Report contents",
    });
    expect(
      within(contents)
        .getAllByRole("link")
        .slice(0, 2)
        .map((a) => a.getAttribute("href")),
    ).toEqual(["#summary", "#scope"]);
    for (const section of documentSample.outline)
      expect(
        within(contents).getByRole("link", { name: section }),
      ).toBeInTheDocument();
    const cites = screen.getAllByRole("button", { name: /^Evidence \d+:/ });
    expect(cites[0]).toHaveAccessibleName("Evidence 1: Recorded sessions");
    const details = screen.getByRole("complementary", {
      name: "Document details",
    });
    const resolved = within(details)
      .getByText("Citations resolved")
      .closest("li")!;
    expect(resolved).toHaveClass("is-ok");
    expect(resolved).toHaveTextContent(/(\d+) of \1$/);
    expect(
      within(details).getByText("Counts traced to cited facts").closest("li"),
    ).toHaveClass("is-ok");
    expect(container.textContent).not.toMatch(FORBIDDEN);
    expect(
      screen.queryByLabelText("Digest held outside the system"),
    ).not.toBeInTheDocument();
  });

  it("opens the fact behind a citation and returns to the details on Escape", async () => {
    vi.stubGlobal("fetch", api());
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: TITLE });
    const cite = screen.getAllByRole("button", {
      name: /^Evidence \d+: H1 at DP1$/,
    })[0];
    fireEvent.click(cite);
    expect(cite).toHaveAttribute("aria-pressed", "true");
    const inspector = screen.getByRole("complementary", {
      name: "Evidence inspector",
    });
    expect(within(inspector).getByText("Self-reported answer")).toBeVisible();
    expect(inspector).toHaveTextContent("2 of 3 respondents");
    expect(inspector).toHaveTextContent(
      "current.findings[decision_point=DP1, hypothesis_id=H1]",
    );
    fireEvent.click(within(inspector).getByRole("button", { name: "H1" }));
    expect(
      within(inspector).getByRole("heading", { level: 2 }),
    ).toHaveTextContent("H1");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.getByRole("complementary", { name: "Document details" }),
    ).toBeVisible();
    expect(cite).toHaveFocus();
  });

  it("flags an unknown citation and withholds forbidden wording", async () => {
    const doc = documentFixture();
    doc.markdown = doc.markdown
      .replace("[fact:population]", "[fact:not_a_fact]")
      .replace("## Appendix", "The gate caused every exit.\n\n## Appendix");
    vi.stubGlobal("fetch", api(fixture(), doc));
    const { container } = render(<App />);
    await screen.findByRole("heading", { level: 1, name: TITLE });
    expect(screen.getByTitle("Unknown fact not_a_fact")).toHaveTextContent("?");
    expect(screen.getByText("Citations resolved").closest("li")).toHaveClass(
      "is-limit",
    );
    expect(screen.getByText("Text withheld by wording guard")).toBeVisible();
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it("says when the AI draft was rejected and labels an accepted one", async () => {
    const rejected = documentFixture();
    rejected.rejected = ["number 5 is not in the cited facts"];
    vi.stubGlobal("fetch", api(fixture(), rejected));
    const first = render(<App />);
    expect(
      await screen.findByText("AI draft rejected (1 problems); template shown"),
    ).toBeVisible();
    first.unmount();
    const accepted = documentFixture();
    accepted.source = "llm";
    accepted.generated_at = "2026-10-16T03:00:00+00:00";
    accepted.prompt = "report_doc.v1";
    vi.stubGlobal("fetch", api(fixture(), accepted));
    render(<App />);
    expect(await screen.findByText("AI-written · Facts checked")).toBeVisible();
    expect(screen.getByText("AI draft passed")).toBeVisible();
  });

  it("surfaces API errors and withholds a finding with incorrect count wording", async () => {
    const report = fixture();
    report.current.errors = [
      { reason: "Exposure sequence is not an exit event" },
    ];
    report.current.findings[0].text = "2 of 6 visitors";
    vi.stubGlobal("fetch", api(report));
    render(<App />);
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent("Exposure sequence is not an exit event");
    expect(warning).toHaveTextContent("numerator or denominator");
    expect(screen.queryByText("2 of 6 visitors")).not.toBeInTheDocument();
  });

  it("flags a report that omits the Other hypothesis", async () => {
    const report = fixture();
    report.hypotheses = report.hypotheses.filter((h) => h.id !== "H_other");
    vi.stubGlobal("fetch", api(report));
    render(<App />);
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent(
      "H_other is missing",
    );
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
  vi.stubGlobal("fetch", api());
  history.replaceState(null, "", "/report/");
  const first = render(<App />);
  await screen.findByRole("heading", { level: 1, name: TITLE });
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

it("keeps the visitor's session beside the document", async () => {
  localStorage.setItem("ghost:judge_sid", "s2");
  const value = fixture();
  value.run.mode = "demo";
  vi.stubGlobal("fetch", api(value));
  history.replaceState(null, "", "/report/#coverage");
  render(<App />);
  await screen.findByRole("heading", { level: 3, name: "Coverage" });
  expect(
    screen.getByText("Prepared investigation + recorded activity"),
  ).toBeVisible();
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

it("keeps the engine's verification limits visible in the document", async () => {
  vi.stubGlobal("fetch", api());
  history.replaceState(null, "", "/report/#limitations");
  render(<App />);
  const limits = await screen.findByRole("complementary", {
    name: "Limitations",
  });
  expect(limits).toHaveTextContent("Commit: uncommitted.");
  expect(limits).toHaveTextContent("Simulated sessions:");
});
