import { useState, type ReactNode } from "react";
import { hasOperatorToken, setOperatorToken } from "./api";

export function OperatorGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(hasOperatorToken);
  const [token, setToken] = useState("");
  if (new URLSearchParams(location.search).get("operator") !== "1") return null;
  if (!unlocked)
    return (
      <form
        className="operator-access"
        onSubmit={(event) => {
          event.preventDefault();
          if (!token.trim()) return;
          setOperatorToken(token);
          setToken("");
          setUnlocked(true);
        }}
      >
        <label htmlFor="operator-token">Operator token</label>
        <div className="snapshot-input">
          <input
            id="operator-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
          <button className="secondary" disabled={!token.trim()}>
            Unlock operator tools
          </button>
        </div>
        <p className="small muted">
          The token stays in this page’s memory and is sent only with operator
          requests.
        </p>
      </form>
    );
  return (
    <div className="operator-access unlocked">
      <div className="operator-access-heading">
        <span className="small muted">Operator access</span>
        <button
          className="quiet"
          onClick={() => {
            setOperatorToken("");
            setUnlocked(false);
          }}
        >
          Change token
        </button>
      </div>
      {children}
    </div>
  );
}
