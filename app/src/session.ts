/** UUIDs also work on a phone visiting a LAN HTTP development URL. */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getSessionId(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("sid");
  const id = fromUrl || sessionStorage.getItem("ghost:session_id") || uuid();
  sessionStorage.setItem("ghost:session_id", id);
  return id;
}

export function sessionKey(id: string, name: string): string {
  return `ghost:${id}:${name}`;
}
