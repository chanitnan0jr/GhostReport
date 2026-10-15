import { SiteHeader } from "../../shared/SiteHeader";
import { useEffect, useState } from "react";

export function useConsoleHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const update = () => setHash(location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return hash;
}

export function ConsoleHeader({ hash }: { hash: string }) {
  return (
    <SiteHeader
      surfaceClassName={`console-header-surface${hash === "#segments" ? " segment-header-surface" : ""}`}
    />
  );
}
