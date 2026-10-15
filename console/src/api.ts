import type { Report, SnapshotResult } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(5000),
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      value &&
      typeof value === "object" &&
      "detail" in value &&
      typeof value.detail === "string"
        ? value.detail
        : "The request could not be completed";
    throw new ApiError(response.status, detail);
  }
  return value;
}

export async function fetchReport(signal?: AbortSignal): Promise<Report> {
  const value = await request("/api/report", { signal });
  if (
    !value ||
    typeof value !== "object" ||
    !("run" in value) ||
    !("current" in value) ||
    !("workflow" in value) ||
    !("hypotheses" in value)
  )
    throw new Error("Unexpected report response");
  return value as Report;
}

async function snapshotRequest(
  path: string,
  body?: object,
): Promise<SnapshotResult> {
  const value = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (
    !value ||
    typeof value !== "object" ||
    !("digest" in value) ||
    typeof value.digest !== "string" ||
    !("version" in value) ||
    !("data_cutoff" in value)
  )
    throw new Error("Unexpected snapshot response");
  return value as SnapshotResult;
}

export const lockV1 = () => snapshotRequest("/api/lock");
export const writeSnapshot = (digest: string) =>
  snapshotRequest("/api/snapshot", { v1_digest: digest });
