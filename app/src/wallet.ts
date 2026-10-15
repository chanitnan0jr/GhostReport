import { getTracker, type Tracker } from "./track";
import { uuid } from "./session";

export const INSTRUMENT_REJECT = false;
const configuredRate = Number(import.meta.env.VITE_RPC_ERROR_RATE ?? "0.15");
export const RPC_ERROR_RATE = Number.isFinite(configuredRate)
  ? Math.min(1, Math.max(0, configuredRate))
  : 0.15;

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
    if (INSTRUMENT_REJECT) {
      track(
        "wallet_rejected",
        "MockWalletPopup",
        { project_id: projectId },
        attempt_id,
      );
    }
    callbacks.onFailure(error.message);
  }

  function approve(): void {
    if (settled) return;
    settled = true;
    if (random() < RPC_ERROR_RATE) {
      if (INSTRUMENT_REJECT) {
        track(
          "wallet_errored",
          "MockWalletPopup",
          { project_id: projectId },
          attempt_id,
        );
      }
      callbacks.onFailure("Simulated RPC error. You can try connecting again.");
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
          "Connection rejected. You can try again whenever you’re ready.",
        ),
      );
    },
  };
}
