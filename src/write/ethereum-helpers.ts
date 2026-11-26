import * as Logger from '../logger';
import { State, EthereumTxStatus, GasPriceStrategy } from '../model/state';
import { getCurrentClockTime, getTenDayPeriod, getToday, jsonStringifyComplexTypes, toNumber } from '../helpers';
import { describeError } from '../redact';
import { TransactionConfig, TransactionReceipt } from 'web3-core';
import {TxData} from "@ethereumjs/tx";

const GAS_LIMIT_ESTIMATE_EXTRA = 300000;
const GAS_LIMIT_HARD_LIMIT = 2000000;

export type Type = 'ready-to-sync' | 'ready-for-committee';

export interface EthereumTxParams {
  EthereumDiscountGasPriceFactor: number;
  EthereumDiscountTxTimeoutSeconds: number;
  EthereumNonDiscountTxTimeoutSeconds: number;
  EthereumMaxGasPrice: number;
  EthereumMaxCommittedDailyTx: number;
  EthereumMaxFeesPerTenDaysEth: number;
  EthereumChainId: number;
  VoteUnreadyValiditySeconds: number;
  SuspendVoteUnready: boolean;
}

/** A spending limit stopped the tx before it was signed: nothing was sent. */
export class SpendingLimitError extends Error {}

/** The RPC is not on the expected chain: nothing was signed. */
export class ChainCheckError extends Error {}

export function chainMismatchReason(rpcChainId: number, expectedChainId: number) {
  return `chain id mismatch: RPC reports ${rpcChainId}, expected ${expectedChainId}`;
}

/** The signer service failed or refused: nothing was sent. */
export class SignerError extends Error {}

export function getGasPriceStrategy(previousTxStatus: EthereumTxStatus | undefined): GasPriceStrategy {
  if (!previousTxStatus) return 'discount';
  if (previousTxStatus.Status == 'final') return 'discount';
  return 'recommended';
}

export async function calcGasPrice(
  strategy: GasPriceStrategy,
  state: State,
  config: EthereumTxParams
): Promise<number> {
  if (!state.web3) throw new Error('Cannot calc gas price until web3 client is initialized.');

  const recommendedGasPrice = parseInt(await state.web3.eth.getGasPrice());
  if (recommendedGasPrice <= 0) {
    throw new Error(`Cannot retrieve recommended gas price.`);
  }

  let res = recommendedGasPrice;
  if (strategy == 'discount') res = Math.round(config.EthereumDiscountGasPriceFactor * recommendedGasPrice);
  if (res > config.EthereumMaxGasPrice) {
    Logger.error(`Gas price ${res} surpassed maximum allowed ${config.EthereumMaxGasPrice}.`);
    res = config.EthereumMaxGasPrice;
  }
  return res;
}

/**
 * The daily tx limit, when it is already reached by txs this writer saw committed today: the election
 * and vote-unready logic then decide nothing at all, so without this the status would look healthy
 * while a needed tx (e.g. ready-for-committee) is held back until the next UTC day. '' when not reached.
 */
export function dailyLimitReachedReason(state: State, config: Pick<EthereumTxParams, 'EthereumMaxCommittedDailyTx'>): string {
  const committedToday = state.EthereumCommittedTxStats[getToday()] ?? 0;
  if (committedToday < config.EthereumMaxCommittedDailyTx) return '';
  return `daily tx limit reached: ${committedToday} txs committed today (max ${config.EthereumMaxCommittedDailyTx}), nothing is sent until the next UTC day`;
}

/**
 * Refuses a tx that could break a spending limit. Both limits hold across restarts (the counters are
 * restored from status.json) and count what the chain says, not only what this process saw:
 *  - daily: the nonce counts every tx mined from the guardian address today, including txs that were
 *    mined after this process gave up on them, and txs anyone else sent with the same key.
 *  - fees: what this 10-day period already spent, plus the most this tx can cost (gas limit x price).
 */
export function checkSpendingLimits(nonce: number, gasLimit: number, gasPrice: number, state: State, config: EthereumTxParams) {
  const today = getToday();
  if (!state.EthereumDailyNonce || state.EthereumDailyNonce.Day !== today || nonce < state.EthereumDailyNonce.Nonce) {
    state.EthereumDailyNonce = { Day: today, Nonce: nonce };
  }
  const minedToday = nonce - state.EthereumDailyNonce.Nonce;
  const committedToday = state.EthereumCommittedTxStats[today] ?? 0;
  const txsToday = Math.max(minedToday, committedToday);
  if (txsToday >= config.EthereumMaxCommittedDailyTx) {
    throw new SpendingLimitError(
      `daily tx limit reached: ${txsToday} txs mined from the guardian address today (max ${config.EthereumMaxCommittedDailyTx})`
    );
  }

  const spent = state.EthereumFeesStats[getTenDayPeriod()] ?? 0;
  const worstCaseFee = (gasLimit * gasPrice) / 1e18;
  if (spent + worstCaseFee > config.EthereumMaxFeesPerTenDaysEth) {
    throw new SpendingLimitError(
      `fee budget: ${spent.toFixed(6)} ETH spent in this 10-day period and this tx could cost up to ${worstCaseFee.toFixed(
        6
      )} ETH (budget ${config.EthereumMaxFeesPerTenDaysEth} ETH)`
    );
  }
}

export async function signAndSendTransaction(
  encodedAbi: string,
  contractAddress: string,
  senderAddress: string,
  gasPrice: number,
  state: State,
  config: EthereumTxParams
): Promise<string> {
  if (!state.web3) throw new Error('Cannot send tx until web3 client is initialized.');
  if (!state.signer) throw new Error('Cannot send tx until signer is initialized.');
  if (!state.chainId) throw new Error('Cannot send tx until the chain id is known.');

  // checked again right before signing: the RPC behind the same URL can change between ticks
  const rpcChainId = Number(await state.web3.eth.getChainId());
  if (rpcChainId !== config.EthereumChainId || rpcChainId !== state.chainId) {
    throw new ChainCheckError(chainMismatchReason(rpcChainId, config.EthereumChainId));
  }

  // 'latest' ignores the pending pool on purpose: at most one tx is in flight, and a resend after a
  // timeout must reuse its nonce so that it replaces the stuck tx instead of queueing behind it
  const nonce = await state.web3.eth.getTransactionCount(senderAddress, 'latest');

  const txConfig: TransactionConfig = {
    from: senderAddress,
    to: contractAddress,
    gasPrice: gasPrice,
    data: encodedAbi,
    nonce: nonce
  };

  Logger.log(`About to estimate gas for tx object: ${jsonStringifyComplexTypes(txConfig)}.`);

  let gasLimit = toNumber(await state.web3.eth.estimateGas(txConfig));
  if (gasLimit <= 0) {
    throw new Error(`Cannot estimate gas for tx with data ${encodedAbi}.`);
  }
  gasLimit += GAS_LIMIT_ESTIMATE_EXTRA;
  if (gasLimit > GAS_LIMIT_HARD_LIMIT) {
    throw new Error(`Gas limit estimate ${gasLimit} over hard limit ${GAS_LIMIT_HARD_LIMIT}.`);
  }

  checkSpendingLimits(nonce, gasLimit, gasPrice, state, config);

  // Prepare transaction data for signing
  const txData : TxData = {
    data: txConfig.data,
    gasLimit: gasLimit,
    gasPrice: String(txConfig.gasPrice),
    nonce: txConfig.nonce,
    value: String(txConfig.value ||  '0x'),
    to: txConfig.to,
  }

  Logger.log(`About to sign and send tx object: ${jsonStringifyComplexTypes(txData)}.`);

  let signed: { rawTransaction?: string; transactionHash?: string };
  try {
    // the client recovers the sender from the signature and rejects it unless it is our guardian address
    signed = await state.signer.sign(txData, state.chainId, senderAddress.toLowerCase());
  } catch (err) {
    throw new SignerError(`signer failed: ${describeError(err, 200)}`);
  }
  const { rawTransaction, transactionHash } = signed ?? {};
  if (!rawTransaction || !transactionHash) {
    throw new SignerError(`signer returned no signed transaction`);
  }
  state.SignerError = undefined;

  const web3 = state.web3;
  return new Promise<string>((resolve, reject) => {
    // normally this returns a promise that resolves on receipt, but we ignore this mechanism and have our own
    web3.eth
      .sendSignedTransaction(rawTransaction, (err) => {
        if (err) reject(err);
        else resolve(transactionHash);
      })
      .catch(() => {
        // do nothing (ignore the web3 promise)
      });
  });
}

export function handlePendingTxTimeout(status: EthereumTxStatus | undefined, state: State, config: EthereumTxParams) {
  if (!status) return;
  if (status.EthBlock > 0) return; // committed
  if (status.Status != 'pending') return;

  const now = getCurrentClockTime();
  const timeout =
    status.GasPriceStrategy == 'discount'
      ? config.EthereumDiscountTxTimeoutSeconds
      : config.EthereumNonDiscountTxTimeoutSeconds;
  if (now - status.SendTime > timeout) {
    Logger.error(`Last ethereum ${status.Type} tx ${status.TxHash} timed out with gas price ${status.GasPrice}.`);
    status.Status = 'timeout';
    state.EthereumConsecutiveTxTimeouts++;
  }
}

export function getReceiptFeeInEth(receipt: TransactionReceipt, status: EthereumTxStatus): number {
  return ((status.GasPrice / 1e9) * receipt.gasUsed) / 1e9;
}
