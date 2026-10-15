import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import type { Tracker } from "./track";
import type { Project } from "./types";
import type { Wallet } from "./wallet";

interface Props {
  project: Project;
  wallet: Wallet | null;
  displayId: string;
  tracker: Tracker;
  error: string;
  onConnect: () => void;
  onNotNow: () => void;
  onClose: () => void;
}

export function ApplyModal(props: Props) {
  const { wallet, project, displayId, tracker } = props;
  const loggedDisplay = useRef<string | null>(null);
  useEffect(() => {
    if (!wallet && loggedDisplay.current !== displayId) {
      loggedDisplay.current = displayId;
      tracker.track("wallet_gate_shown", "ApplyModal", {
        project_id: project.id,
      });
    }
  }, [wallet, displayId, tracker, project.id]);

  function requireWallet() {
    return <WalletGate {...props} />;
  }

  if (!wallet) return requireWallet();
  return <ApplicationForm project={project} onClose={props.onClose} />;
}

function WalletGate({ project, error, onConnect, onNotNow }: Props) {
  const permissionCopy =
    "Connecting lets this application see your public account and request approval for actions. It cannot move funds without your approval.";
  return (
    <Modal titleId="gate-title" onDismiss={onNotNow}>
      <div className="modal-symbol" aria-hidden="true">
        ◎
      </div>
      <h2 id="gate-title">Connect wallet to apply</h2>
      <p>
        Start your application for <strong>{project.title}</strong>.
      </p>
      <div className="permission-copy">
        <h3>What you’re allowing</h3>
        <p>{permissionCopy}</p>
      </div>
      <p className="small muted">
        This demo uses a mock wallet. No real wallet or funds are involved.
      </p>
      {error && (
        <p className="simulation-notice" role="status">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="button primary" onClick={onConnect}>
          Connect
        </button>
        <button className="button text" onClick={onNotNow}>
          Not now
        </button>
      </div>
    </Modal>
  );
}

function ApplicationForm({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [submitted, setSubmitted] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
  };
  return (
    <Modal titleId="application-title" onDismiss={onClose}>
      <span className="connection-label">Connected · Mock wallet</span>
      <h2 id="application-title">
        {submitted ? "Your idea has a beginning." : "Tell us about your idea"}
      </h2>
      {submitted ? (
        <>
          <p>Your demo application is complete. Nothing was sent or stored.</p>
          <button className="button primary" onClick={onClose}>
            Back to project
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <p>{project.title}</p>
          <label className="form-label">
            Project name
            <input
              required
              maxLength={120}
              placeholder="A name for your idea"
            />
          </label>
          <label className="form-label">
            What would you like to build?
            <textarea
              required
              maxLength={1500}
              rows={4}
              placeholder="A few sentences is a good start."
            />
          </label>
          <p className="small muted">
            This is a practice application. Your details are not submitted.
          </p>
          <div className="actions">
            <button className="button primary" type="submit">
              Finish demo application
            </button>
            <button className="button text" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
