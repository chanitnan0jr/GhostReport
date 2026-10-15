import { readSandboxToken } from "../../../shared/sandbox";
import type {
  InvestigateStarted,
  LockRequest,
  LockResult,
  ResetResult,
  Reveal,
  SandboxState,
  TrafficRequest,
  TrafficResult,
} from "./types";

export class SandboxError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(
  id: string,
  path: string,
  init: RequestInit & { owner?: boolean } = {},
): Promise<T> {
  const { owner, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (owner) {
    const token = readSandboxToken(id);
    if (!token)
      throw new SandboxError(
        401,
        "Only the browser that started this sandbox can change it.",
      );
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (rest.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/sandbox/${id}/${path}`, {
    ...rest,
    headers,
    signal: rest.signal ?? AbortSignal.timeout(20_000),
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      value &&
      typeof value === "object" &&
      "detail" in value &&
      typeof value.detail === "string"
        ? value.detail
        : `The sandbox request failed (${response.status}).`;
    throw new SandboxError(response.status, detail);
  }
  return value as T;
}

export const canControl = (id: string) => readSandboxToken(id) !== null;

export const fetchState = (id: string, signal?: AbortSignal) =>
  call<SandboxState>(id, "state", { signal });

export const fetchReveal = (id: string, signal?: AbortSignal) =>
  call<Reveal>(id, "reveal", { signal });

export const sendTraffic = (id: string, body: TrafficRequest) =>
  call<TrafficResult>(id, "traffic", {
    method: "POST",
    body: JSON.stringify(body),
    owner: true,
  });

export const startInvestigation = (id: string) =>
  call<InvestigateStarted>(id, "investigate", { method: "POST", owner: true });

// Empties the sandbox and returns it to step 1; the id, owner and expiry stay.
export const resetSandbox = (id: string) =>
  call<ResetResult>(id, "reset", { method: "POST", owner: true });

export const lockSandbox = (id: string, body: LockRequest) =>
  call<LockResult>(id, "lock", {
    method: "POST",
    body: JSON.stringify(body),
    owner: true,
  });
