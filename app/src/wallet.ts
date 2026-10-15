import { getTracker, type Tracker } from "./track";
import { uuid } from "./session";

const configuredRate = Number(import.meta.env.VITE_RPC_ERROR_RATE ?? "0.10");
export const RPC_ERROR_RATE = Number.isFinite(configuredRate)
  ? Math.min(1, Math.max(0, configuredRate))
  : 0.1;

export interface Wallet {
  kind: "mock";
}
export interface WalletAttempt {
  attempt_id: string;
  approve: () => void;
  reject: () => void;
}

interface Callbacks {
  onConnected: (wallet: Wallet) => void;
  onFailure: (message: string) => void;
}

export function connectWallet(
  projectId: string,
  callbacks: Callbacks,
  tracker: Tracker = getTracker(),
  random: () => number = Math.random,
): WalletAttempt {
  const firstAttempt = !tracker.hasAttempted();
  const attempt_id = uuid();
  const { track } = tracker;
  track(
    "wallet_attempted",
    "ApplyModal",
    { project_id: projectId },
    attempt_id,
  );
  let settled = false;

  function onReject(error: Error): void {
    callbacks.onFailure(error.message);
  }

  function approve(): void {
    if (settled) return;
    settled = true;
    if (firstAttempt && random() < RPC_ERROR_RATE) {
      track(
        "wallet_errored",
        "MockWalletPopup",
        { project_id: projectId },
        attempt_id,
      );
      callbacks.onFailure("Simulated network error (demo) — please try again");
      return;
    }
    track(
      "wallet_connected",
      "MockWalletPopup",
      { project_id: projectId },
      attempt_id,
    );
    callbacks.onConnected({ kind: "mock" });
  }

  return {
    attempt_id,
    approve,
    reject: () => {
      if (settled) return;
      settled = true;
      onReject(
        new Error(
          "You chose not to connect. You can try again whenever you’re ready.",
        ),
      );
    },
  };
}
