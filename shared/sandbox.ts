// Sandboxes (engine/sandbox.py): a visitor's own simulated run. The token that
// controls one stays in this browser and is never put in a URL.

export const SANDBOX_START = "/sandbox/";

const key = (id: string) => `ghostreport.sandbox.${id}`;

export function saveSandboxToken(id: string, token: string): boolean {
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      storage().setItem(key(id), token);
      return true;
    } catch {
      // Blocked storage: try the next one.
    }
  }
  return false;
}

export function readSandboxToken(id: string): string | null {
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      const token = storage().getItem(key(id));
      if (token) return token;
    } catch {
      // Blocked storage: try the next one.
    }
  }
  return null;
}

export function sandboxReportUrl(id: string, hash = "#segments"): string {
  return `/report/?sandbox=${encodeURIComponent(id)}${hash}`;
}

export interface StartedSandbox {
  sandbox_id: string;
  expires_at: string;
  saved: boolean; // false: this browser cannot keep the token, so it cannot control it
}

/** POST /api/sandbox, then keep the token. Throws an Error with the server's detail. */
export async function startSandbox(): Promise<StartedSandbox> {
  const response = await fetch("/api/sandbox", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String(body.detail)
        : `The sandbox could not start (${response.status}).`;
    throw new Error(detail);
  }
  const { sandbox_id, token, expires_at } = body as {
    sandbox_id: string;
    token: string;
    expires_at: string;
  };
  return { sandbox_id, expires_at, saved: saveSandboxToken(sandbox_id, token) };
}
