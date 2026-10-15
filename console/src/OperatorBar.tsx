import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  analyzeRepository,
  approveInvestigation,
  fetchDraft,
  lockV1,
  writeSnapshot,
} from "./api";
import { safeText, time } from "./format";
import type { InvestigationDraft, Report } from "./types";

export function OperatorBar({
  report,
  refresh,
}: {
  report: Report;
  refresh: () => Promise<void>;
}) {
  const [externalDigest, setExternalDigest] = useState("");
  const [returnedDigest, setReturnedDigest] = useState("");
  const [busy, setBusy] = useState<
    "lock" | "snapshot" | "analyze" | "approve" | null
  >(null);
  const [draft, setDraft] = useState<InvestigationDraft | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const digest = report.v1?.digest ?? returnedDigest;
  const locked = report.locked || Boolean(returnedDigest);

  useEffect(() => {
    if (locked) return;
    let active = true;
    void fetchDraft()
      .then((value) => {
        if (active) setDraft(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [locked]);

  async function analyze() {
    setBusy("analyze");
    setError("");
    setMessage("");
    try {
      setDraft(await analyzeRepository());
      setMessage("Draft ready for operator review.");
    } catch (error) {
      failure(error);
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    setBusy("approve");
    setError("");
    setMessage("");
    try {
      await approveInvestigation();
      setDraft(null);
      setMessage(
        "Investigation approved. Review the report before locking v1.",
      );
      await refresh();
    } catch (error) {
      failure(error);
    } finally {
      setBusy(null);
    }
  }

  function failure(error: unknown) {
    setError(
      error instanceof ApiError
        ? `${error.status} · ${safeText(error.message)}`
        : error instanceof Error
          ? safeText(error.message)
          : "Request unavailable",
    );
  }

  async function lock() {
    setBusy("lock");
    setError("");
    setMessage("");
    try {
      const result = await lockV1();
      setReturnedDigest(result.digest);
      setMessage(`v1 locked at ${time(result.data_cutoff)}`);
      await refresh();
    } catch (error) {
      failure(error);
    } finally {
      setBusy(null);
    }
  }

  async function snapshot(event: FormEvent) {
    event.preventDefault();
    setBusy("snapshot");
    setError("");
    setMessage("");
    try {
      const result = await writeSnapshot(externalDigest.trim());
      setMessage(
        `Snapshot v${result.version} written at ${time(result.data_cutoff)}`,
      );
      setExternalDigest("");
      await refresh();
    } catch (error) {
      failure(error);
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(digest);
      setCopied(true);
    } catch {
      setError(
        "Clipboard unavailable. Select the digest below and copy it manually.",
      );
    }
  }

  return (
    <div className="operator" aria-label="Investigation controls">
      <div className="operator-heading">
        <span className="section-kicker">Operator controls</span>
        <div className="run-info">
          <span>
            Run <code>{safeText(report.run.run_id)}</code>
          </span>
          <span>
            Mode <strong>{safeText(report.run.mode)}</strong>
          </span>
        </div>
      </div>
      {!locked && (
        <div className="operator-stages">
          <div className="operator-stage-actions">
            <button
              className="secondary"
              disabled={busy !== null}
              onClick={() => void analyze()}
            >
              {busy === "analyze" ? "Reading repository…" : "Analyze"}
            </button>
            <button
              className="secondary"
              disabled={busy !== null || !draft}
              onClick={() => void approve()}
            >
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
          </div>
          {draft && (
            <details className="draft-review" open>
              <summary>
                Review the proposed investigation before approving
              </summary>
              <pre>
                {safeText(
                  JSON.stringify(
                    {
                      workflow: draft.workflow,
                      hypotheses: draft.hypotheses,
                      probe_options: draft.probe_options,
                      rejected: draft.rejected,
                    },
                    null,
                    2,
                  ),
                )}
              </pre>
            </details>
          )}
        </div>
      )}
      <div className="operator-grid">
        <div className="lock-controls">
          {locked ? (
            <div className="lock-status">
              v1 locked · <code>{digest.slice(0, 12)}</code>
            </div>
          ) : (
            <button
              className="primary"
              disabled={busy !== null}
              onClick={() => void lock()}
            >
              {busy === "lock" ? "Locking…" : "Lock v1"}
            </button>
          )}
          {digest ? (
            <>
              <div className="digest-box">
                <code aria-label="v1 digest">{digest}</code>
                <button className="quiet" onClick={() => void copy()}>
                  {copied ? "Copied" : "Copy digest"}
                </button>
              </div>
              <p className="digest-instruction">
                Give this digest to a mentor/judge before the first probe
              </p>
            </>
          ) : (
            <p className="muted">
              Lock the baseline before collecting probe responses.
            </p>
          )}
        </div>
        <form
          className="snapshot-form"
          onSubmit={(event) => void snapshot(event)}
        >
          <label htmlFor="external-digest">
            Digest held outside the system
          </label>
          <div className="snapshot-input">
            <input
              id="external-digest"
              value={externalDigest}
              onChange={(event) => setExternalDigest(event.target.value)}
              placeholder="Paste the externally held v1 digest"
              autoComplete="off"
              spellCheck={false}
              required
              disabled={!locked || busy !== null}
            />
            <button
              className="secondary"
              disabled={!locked || busy !== null || !externalDigest.trim()}
            >
              {busy === "snapshot" ? "Writing…" : "Write v2 snapshot"}
            </button>
          </div>
          <p className="muted small">
            Paste it yourself. This field is never filled from the report.
          </p>
        </form>
      </div>
      {error && (
        <div className="warning" role="alert">
          <strong>Operator action did not complete</strong>
          <span>{error}</span>
        </div>
      )}
      {message && (
        <p className="action-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
