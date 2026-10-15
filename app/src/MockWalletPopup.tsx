import { Modal } from "./Modal";
import { RPC_ERROR_RATE, type WalletAttempt } from "./wallet";

export function MockWalletPopup({ attempt }: { attempt: WalletAttempt }) {
  return (
    <Modal
      titleId="wallet-title"
      onDismiss={attempt.reject}
      className="wallet-popup"
    >
      <span className="category">Mock wallet · In-page simulation</span>
      <h2 id="wallet-title">Connect to Common Ground?</h2>
      <p>This application is asking to view your public account.</p>
      <div className="permission-copy">
        <h3>Connection request</h3>
        <p>
          View your account identifier and ask you to approve future actions.
        </p>
      </div>
      <p className="small muted">
        Simulated RPC error rate: {Math.round(RPC_ERROR_RATE * 100)}%. No real
        transaction will be made.
      </p>
      <div className="actions">
        <button className="button primary" onClick={attempt.approve}>
          Approve
        </button>
        <button className="button secondary" onClick={attempt.reject}>
          Reject
        </button>
      </div>
    </Modal>
  );
}
