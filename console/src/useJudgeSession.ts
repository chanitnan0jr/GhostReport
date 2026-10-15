import { useEffect, useState } from "react";

function readSid(): string | null {
  const fromUrl = new URLSearchParams(location.search).get("sid");
  if (fromUrl) return fromUrl;
  try {
    return localStorage.getItem("ghost:judge_sid");
  } catch {
    return null;
  }
}

export function useJudgeSession(): string | null {
  const [sid, setSid] = useState(readSid);
  useEffect(() => {
    const refresh = () => setSid(readSid());
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("popstate", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("popstate", refresh);
    };
  }, []);
  return sid;
}
