import { expect, it, vi } from "vitest";
import sample from "../../fixtures/report.sample.json";
import {
  analyzeRepository,
  approveInvestigation,
  fetchDraft,
  fetchReport,
  lockV1,
  setOperatorToken,
  writeSnapshot,
} from "./api";

it("sends the token on every operator endpoint and never on the public report", async () => {
  const fetchMock = vi.fn().mockImplementation(async (path: string) => {
    const value =
      path === "/api/report"
        ? sample
        : path === "/api/lock" || path === "/api/snapshot"
          ? {
              version: 1,
              digest: "external-digest",
              data_cutoff: sample.current.data_cutoff,
            }
          : {};
    return new Response(JSON.stringify(value));
  });
  vi.stubGlobal("fetch", fetchMock);
  setOperatorToken("test-operator-token");
  await fetchReport();
  await fetchDraft();
  await analyzeRepository();
  await approveInvestigation();
  await lockV1();
  await writeSnapshot("operator-pasted-digest");
  for (const [path, init] of fetchMock.mock.calls) {
    expect(init.headers.get("Authorization")).toBe(
      path === "/api/report" ? null : "Bearer test-operator-token",
    );
  }
  expect(
    fetchMock.mock.calls.find(([path]) => path === "/api/approve")?.[1].body,
  ).toBe(JSON.stringify({ approved_by: "operator" }));
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

it("refuses operator requests before the token is entered", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(analyzeRepository()).rejects.toMatchObject({ status: 401 });
  await expect(approveInvestigation()).rejects.toMatchObject({ status: 401 });
  await expect(lockV1()).rejects.toMatchObject({ status: 401 });
  await expect(writeSnapshot("pasted")).rejects.toMatchObject({ status: 401 });
  expect(fetchMock).not.toHaveBeenCalled();
});
