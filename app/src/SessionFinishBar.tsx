import "./SessionFinishBar.css";

export function SessionFinishBar({
  sessionId,
  visible,
}: {
  sessionId: string;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="session-finish-space">
      <aside className="session-finish-bar" aria-label="Finished session">
        <a href={`/report/?sid=${encodeURIComponent(sessionId)}#segments`}>
          Finished? <strong>See where you landed →</strong>
        </a>
      </aside>
    </div>
  );
}
