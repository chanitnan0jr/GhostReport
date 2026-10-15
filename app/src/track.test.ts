import { describe, expect, it, vi } from "vitest";
import { createTracker, validateProps } from "./track";
import { connectWallet } from "./wallet";

function trackerForTest() {
  return createTracker({ sessionId: "s_test", autoFlush: false });
}

describe("canonical analytics", () => {
  it("persists contiguous per-session sequences across reloads", () => {
    const first = trackerForTest();
    const one = first.track("project_viewed", "ProjectPage", {
      project_id: "p3",
    });
    const second = trackerForTest();
    const two = second.track("apply_clicked", "ProjectPage", {
      project_id: "p3",
    });
    expect([one.seq, two.seq]).toEqual([1, 2]);
    expect(one).not.toHaveProperty("received_at");
    expect(one).toMatchObject({
      session_id: "s_test",
      attempt_id: null,
      schema_version: 1,
    });
    expect(one.event_id).not.toEqual(two.event_id);
  });

  it("keeps event IDs and payloads unchanged on failed POST retry", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response("{}"));
    const tracker = createTracker({
      sessionId: "s_test",
      fetch: fetchMock,
      autoFlush: false,
    });
    tracker.track("project_viewed", "ProjectPage", { project_id: "p1" });
    await tracker.flush();
    expect(tracker.pending()).toHaveLength(1);
    await tracker.flush();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/events");
    expect(fetchMock.mock.calls[0][1]?.body).toBe(
      fetchMock.mock.calls[1][1]?.body,
    );
    expect(tracker.pending()).toHaveLength(0);
  });

  it("retries with backoff and recovers a durable outbox", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}"));
    const tracker = createTracker({ sessionId: "s_test", fetch: fetchMock });
    tracker.track("project_viewed", "ProjectPage");
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tracker.pending()).toHaveLength(0);
  });

  it("beacons pending events on pagehide without clearing unacknowledged events", () => {
    const beacon = vi.fn(() => true);
    const tracker = createTracker({
      sessionId: "s_test",
      beacon,
      autoFlush: false,
    });
    tracker.track("project_viewed", "ProjectPage");
    const stop = tracker.start();
    window.dispatchEvent(new Event("pagehide"));
    expect(beacon).toHaveBeenCalledWith("/api/events", expect.any(Blob));
    expect(tracker.pending()).toHaveLength(1);
    stop();
  });

  it.each([
    { wallet_address: `0x${"a".repeat(40)}` },
    { project_id: `0x${"a".repeat(40)}` },
    { page: `prefix 0x${"A".repeat(40)}` },
    { text: "typed text" },
    { page: "typed text" },
    { project_id: "typed text" },
  ])("rejects private and non-whitelisted props: %o", (props) => {
    expect(() => validateProps(props)).toThrow();
    const tracker = trackerForTest();
    expect(() =>
      tracker.track("project_viewed", "ProjectPage", props),
    ).toThrow();
    expect(tracker.sequence()).toBe(0);
  });

  it("accepts only the allowed project and page values", () => {
    expect(validateProps({ project_id: "p3", page: "ProjectPage" })).toEqual({
      project_id: "p3",
      page: "ProjectPage",
    });
  });
});

describe("mock wallet evidence gap", () => {
  it("assigns a new attempt on every Connect and attributes success to that attempt", () => {
    const tracker = trackerForTest();
    const callbacks = { onConnected: vi.fn(), onFailure: vi.fn() };
    const first = connectWallet("p3", callbacks, tracker, () => 1);
    first.reject();
    const second = connectWallet("p3", callbacks, tracker, () => 1);
    second.approve();
    second.approve();
    const events = tracker.pending();
    expect(first.attempt_id).not.toEqual(second.attempt_id);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(events.map((e) => e.event)).toEqual([
      "wallet_attempted",
      "wallet_attempted",
      "wallet_connected",
    ]);
    expect(events[2].attempt_id).toBe(second.attempt_id);
    expect(callbacks.onConnected).toHaveBeenCalledOnce();
  });

  it("keeps both reject and RPC error uninstrumented by default", () => {
    const tracker = trackerForTest();
    const callbacks = { onConnected: vi.fn(), onFailure: vi.fn() };
    connectWallet("p1", callbacks, tracker, () => 0).approve();
    connectWallet("p1", callbacks, tracker, () => 1).reject();
    expect(tracker.pending().map((e) => e.event)).toEqual([
      "wallet_attempted",
      "wallet_attempted",
    ]);
    expect(callbacks.onFailure).toHaveBeenCalledTimes(2);
  });
});
