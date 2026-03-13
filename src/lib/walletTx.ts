import type { TransactionStatusResponse, TxHistoryResult } from "@provablehq/aleo-types";
import type { TransactionOptions } from "@provablehq/aleo-types";
import { isOnChainTxHash } from "@/lib/aleo";

export type TxState = "submitted" | "confirmed" | "timed_out" | "failed" | "rejected";

export type TxStatusFn = (id: string) => Promise<TransactionStatusResponse>;
export type TxHistoryFn = (program: string) => Promise<TxHistoryResult>;

function normalizeStatus(status: string | undefined): string {
  return (status ?? "").toLowerCase();
}

export async function pollForTxHash(
  tempId: string,
  transactionStatus: TxStatusFn,
  opts?: {
    maxAttempts?: number;
    firstPhaseAttempts?: number;
    firstPhaseDelayMs?: number;
    secondPhaseDelayMs?: number;
    program?: string;
    requestTransactionHistory?: TxHistoryFn;
    historyBefore?: TxHistoryResult | null;
  }
): Promise<{ state: TxState; txHash: string | null }> {
  if (isOnChainTxHash(tempId)) return { state: "confirmed", txHash: tempId };

  const maxAttempts = opts?.maxAttempts ?? 90;
  const firstPhaseAttempts = opts?.firstPhaseAttempts ?? 10;
  const firstPhaseDelayMs = opts?.firstPhaseDelayMs ?? 1000;
  const secondPhaseDelayMs = opts?.secondPhaseDelayMs ?? 2000;

  for (let i = 0; i < maxAttempts; i++) {
    const delay = i < firstPhaseAttempts ? firstPhaseDelayMs : secondPhaseDelayMs;
    await new Promise((r) => setTimeout(r, delay));
    const res = await transactionStatus(tempId);
    if (res.transactionId && isOnChainTxHash(res.transactionId)) {
      return { state: "confirmed", txHash: res.transactionId };
    }
    const status = normalizeStatus(res.status);
    if (status === "rejected") return { state: "rejected", txHash: null };
    if (status === "failed") return { state: "failed", txHash: null };
  }

  // Last chance: try wallet history (many adapters map temp UUID -> final at1 in history).
  const program = opts?.program;
  const requestTransactionHistory = opts?.requestTransactionHistory;
  if (program && requestTransactionHistory) {
    try {
      const after = await requestTransactionHistory(program);
      const directMatch = after.transactions.find((t) => t.id === tempId || t.transactionId === tempId) ?? null;
      if (directMatch && isOnChainTxHash(directMatch.transactionId)) {
        return { state: "confirmed", txHash: directMatch.transactionId };
      }

      const before = opts?.historyBefore ?? null;
      if (before) {
        const beforeSet = new Set(before.transactions.map((t) => t.transactionId));
        const newOnChain = after.transactions.find((t) => isOnChainTxHash(t.transactionId) && !beforeSet.has(t.transactionId));
        if (newOnChain) return { state: "confirmed", txHash: newOnChain.transactionId };
      }
    } catch {
      // ignore history failures, return timed_out below
    }
  }

  return { state: "timed_out", txHash: null };
}

export async function snapshotTxHistory(
  requestTransactionHistory: TxHistoryFn | undefined,
  program: string
): Promise<TxHistoryResult | null> {
  if (!requestTransactionHistory) return null;
  try {
    return await requestTransactionHistory(program);
  } catch {
    return null;
  }
}

export async function executeAndConfirm(
  executeTransaction: ((options: TransactionOptions) => Promise<{ transactionId: string } | undefined>) | undefined,
  transactionStatus: TxStatusFn,
  options: TransactionOptions,
  opts?: {
    requestTransactionHistory?: TxHistoryFn;
    maxAttempts?: number;
  }
): Promise<{ txHash: string }> {
  if (!executeTransaction) throw new Error("Wallet does not support transactions");

  const historyBefore = await snapshotTxHistory(opts?.requestTransactionHistory, options.program);
  const res = await executeTransaction(options);
  const tempId = res?.transactionId;
  if (!tempId) throw new Error("Transaction was not submitted. Please try again.");

  const result = await pollForTxHash(tempId, transactionStatus, {
    maxAttempts: opts?.maxAttempts,
    program: options.program,
    requestTransactionHistory: opts?.requestTransactionHistory,
    historyBefore,
  });
  if (result.state !== "confirmed" || !result.txHash) {
    throw new Error(
      result.state === "rejected"
        ? "Transaction was rejected."
        : result.state === "failed"
          ? "Transaction failed on-chain."
          : "Transaction confirmation timed out. Check your wallet for status."
    );
  }
  return { txHash: result.txHash };
}

