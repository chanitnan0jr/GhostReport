import type { InvestigationDraft, Report, SnapshotResult } from "./types";

// ?sandbox=<id> points every read at that sandbox's own run (engine/sandbox.py).
const SANDBOX_ID = /^sbx-[0-9a-f]{16}$/;
export function sandboxId(search = location.search): string | null {
  const id = new URLSearchParams(search).get("sandbox");
  return id && SANDBOX_ID.test(id) ? id : null;
}
export function apiUrl(path: string): string {
  const id = sandboxId();
  return id && path.startsWith("/api/")
    ? `/api/sandbox/${id}/${path.slice("/api/".length)}`
    : path;
}

let operatorToken = "";
export function setOperatorToken(value: string): void {
  operatorToken = value.trim();
}
export function hasOperatorToken(): boolean {
  return operatorToken.length > 0;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(
  path: string,
  init?: RequestInit,
  authorized = false,
): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (authorized) {
    if (!operatorToken)
      throw new ApiError(401, "Enter an operator token first");
    headers.set("Authorization", `Bearer ${operatorToken}`);
  }
  // Operator routes belong to the judging run only; sandboxes have their own controls.
  const response = await fetch(authorized ? path : apiUrl(path), {
    ...init,
    headers,
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
  const value = await request(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    true,
  );
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

export async function fetchDraft(): Promise<InvestigationDraft | null> {
  return (await request(
    "/api/draft",
    undefined,
    true,
  )) as InvestigationDraft | null;
}

export async function analyzeRepository(): Promise<InvestigationDraft> {
  return (await request(
    "/api/analyze",
    { method: "POST", signal: AbortSignal.timeout(120_000) },
    true,
  )) as InvestigationDraft;
}

export async function approveInvestigation(): Promise<void> {
  await request(
    "/api/approve",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved_by: "operator" }),
    },
    true,
  );
}

export const authorizedRequest = (path: string, init: RequestInit) =>
  request(path, init, true);
