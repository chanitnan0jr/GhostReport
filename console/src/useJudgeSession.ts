import { useEffect, useState } from "react";

function readSid(): string | null {
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
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return sid;
}
