import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProbeCard, type ProbeInvitation } from "./ProbeCard";
import { askedKey } from "./probe";

const invitation: ProbeInvitation = {
  sessionId: "s_probe",
  cohortAtShown: "gate_event_no_attempt",
  eventSeqAtShown: 4,
  plan: {
    plan_id: "plan1",
    question_version: "q1",
    decision_point: "DP1",
    target_cohort: "gate_event_no_attempt",
    stem: "What best describes your decision not to connect right now?",
    options: [
      { id: "a", label: "Just browsing" },
      { id: "b", label: "Not sure who is asking" },
      { id: "other", label: "Something else" },
    ],
    ends_at: "2030-01-01T00:00:00Z",
    closed_hint: false,
  },
};

describe("probe exposure and response", () => {
  it("sends one exposure beacon per successful mount even with StrictMode and rerenders", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <StrictMode>
        <ProbeCard invitation={invitation} onClose={onClose} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <ProbeCard invitation={{ ...invitation }} onClose={onClose} />
      </StrictMode>,
    );
    expect(navigator.sendBeacon).toHaveBeenCalledOnce();
    expect(navigator.sendBeacon).toHaveBeenCalledWith(
      "/api/probe/exposure",
      expect.any(Blob),
    );
    expect(sessionStorage.getItem(askedKey("s_probe"))).toBe("1");
    const labels = screen
      .getAllByRole("checkbox")
      .map((input) => input.parentElement?.textContent);
    expect(labels.at(-1)).toBe("Something else");
  });

  it("supports multiple selections and posts a response linked to the exposure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    render(<ProbeCard invitation={invitation} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Just browsing"));
    fireEvent.click(screen.getByLabelText("Not sure who is asking"));
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/probe/response");
    const response = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(response.option_ids).toEqual(["a", "b"]);
    expect(response.exposure_id).toEqual(expect.any(String));
    expect(response.responded_at).toEqual(expect.any(String));
    expect(response).toMatchObject({
      plan_id: "plan1",
      session_id: "s_probe",
      event_seq_at_shown: 4,
      shown_at: expect.any(String),
      options_shown: expect.arrayContaining(["a", "b", "other"]),
    });
  });

  it("Skip closes synchronously even if response API never resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const onClose = vi.fn();
    render(<ProbeCard invitation={invitation} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("allows dismissal while an answer is still in flight without posting a conflicting skip", () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    render(<ProbeCard invitation={invitation} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Just browsing"));
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries an uncertain answer with exactly the same immutable payload", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network lost"))
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    render(<ProbeCard invitation={invitation} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Just browsing"));
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][1].body).toBe(
      fetchMock.mock.calls[1][1].body,
    );
  });

  it("does not expose a question that expired between exit and mount", () => {
    const onClose = vi.fn();
    render(
      <ProbeCard
        invitation={{
          ...invitation,
          plan: { ...invitation.plan, ends_at: "2020-01-01T00:00:00Z" },
        }}
        onClose={onClose}
      />,
    );
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(askedKey("s_probe"))).toBeNull();
  });

  it("uses keepalive when the browser refuses the exposure beacon", () => {
    vi.mocked(navigator.sendBeacon).mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    render(<ProbeCard invitation={invitation} onClose={vi.fn()} />);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/probe/exposure",
      expect.objectContaining({ keepalive: true }),
    );
  });
});
