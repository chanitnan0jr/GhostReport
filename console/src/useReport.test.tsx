import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import sample from "../../fixtures/report.sample.json";
import { useReport } from "./useReport";

it("polls every 3 seconds, updates findings and stops when unmounted", async () => {
  vi.useFakeTimers();
  const next = structuredClone(sample);
  next.current.findings[0].selected = 3;
  next.current.findings[0].text = "3 of 3 respondents";
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(async () => new Response(JSON.stringify(sample)))
    .mockImplementation(async () => new Response(JSON.stringify(next)));
  vi.stubGlobal("fetch", fetchMock);
  const hook = renderHook(() => useReport());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(hook.result.current.report?.current.findings[0].text).toBe(
    "2 of 3 respondents",
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2999);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(hook.result.current.report?.current.findings[0].text).toBe(
    "3 of 3 respondents",
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);
  hook.unmount();
  await vi.advanceTimersByTimeAsync(6000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("keeps the last report and exposes refresh failure instead of silently clearing it", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(sample)))
      .mockRejectedValueOnce(new Error("Backend unavailable")),
  );
  const hook = renderHook(() => useReport());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(hook.result.current.report?.run.run_id).toBe("sample");
  expect(hook.result.current.error).toBe("Backend unavailable");
});
