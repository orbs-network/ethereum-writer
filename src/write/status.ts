import * as Logger from '../logger';
import { EthereumTxStatus, State } from '../model/state';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { ensureFileDirectoryExists, JsonResponse, getCurrentClockTime, getTenDayPeriod, getToday } from '../helpers';
import { Configuration } from '../config';
import { weiToEth } from '../model/helpers';
import { publicConfig } from '../public-config';
import { describeError, scrub } from '../redact';
import { voteUnreadyOnFinal } from './ethereum';

const MINIMUM_ALLOWED_ETH_BALANCE_WEI = BigInt('100000000000000000'); // 0.1 ETH
const TX_CONSECUTIVE_TIMEOUTS = 10;
const TX_SEND_FAILURE_TIMEOUT = 24 * 60 * 60; // seconds
const KEEP_DAILY_STATS = 14; // days of EthereumCommittedTxStats kept in status.json
const KEEP_FEE_PERIODS = 6; // 10-day periods of EthereumFeesStats kept in status.json

export interface BlockedBy {
  Component: string; // the component this writer's error is downstream of, e.g. "ethereum-reader"
  Reason: string; // short, URL-free, e.g. "syncing 42%"
}

// NOTE: status.json is public on v5 nodes (nginx serves it at /service/ethereum-writer/status).
// Never put the raw config, an RPC URL or an unscrubbed error in it.
export function renderStatus(state: State, config: Configuration): JsonResponse {
  const blockedBy = getBlockedBy(state);
  return {
    Status: getStatusText(state, blockedBy),
    Error: getErrorText(state, config, blockedBy),
    Timestamp: new Date().toISOString(),
    Payload: {
      Uptime: getCurrentClockTime() - state.ServiceLaunchTime,
      MemoryUsage: process.memoryUsage(),
      Version: {
        Semantic: state.CurrentVersion,
        Commit: state.CurrentCommit,
      },
      ...(blockedBy ? { BlockedBy: blockedBy } : {}),
      Reader: {
        Status: state.ReaderStatus,
        Reason: state.ReaderReason,
      },
      LastTickTime: state.LastTickTime,
      EthereumSyncStatus: state.EthereumSyncStatus,
      EthereumChainId: state.chainId,
      // same fields as evm-reader's Payload.EthereumSync
      EthereumSync: {
        LastRpcErrorAt: Math.round(state.RpcErrors.lastAt() / 1000),
        LastRpcError: state.RpcErrors.last(),
        RpcErrorsLastHour: state.RpcErrors.counts(),
      },
      EthereumBalanceLastPollTime: state.EthereumBalanceLastPollTime,
      EtherBalance: state.EtherBalance,
      EthereumCanJoinCommitteeLastPollTime: state.EthereumCanJoinCommitteeLastPollTime,
      EthereumConsecutiveTxTimeouts: state.EthereumConsecutiveTxTimeouts,
      EthereumLastElectionsTx: state.EthereumLastElectionsTx,
      EthereumLastVoteUnreadyTx: state.EthereumLastVoteUnreadyTx,
      EthereumLastVoteUnreadyTime: state.EthereumLastVoteUnreadyTime,
      EthereumCommittedTxStats: state.EthereumCommittedTxStats,
      EthereumFeesStats: state.EthereumFeesStats,
      EthereumDailyNonce: state.EthereumDailyNonce,
      SpendingLimit: state.SpendingLimitReason,
      ReputationsLastPollTime: state.ReputationsLastPollTime,
      Reputations: state.Reputations,
      ManagementLastPollTime: state.ManagementLastPollTime,
      ManagementRefTime: state.ManagementRefTime,
      ManagementEthRefBlock: state.ManagementEthRefBlock,
      ManagementInCommittee: state.ManagementInCommittee,
      ManagementIsStandby: state.ManagementIsStandby,
      ManagementMyElectionStatus: state.ManagementMyElectionsStatus,
      TimeEnteredBadReputation: state.TimeEnteredBadReputation,
      TimeEnteredTopology: state.TimeEnteredTopology,
      Config: publicConfig(config),
      IsRegistered: state.isRegistered,
    },
  };
}

export function writeStatusToDisk(filePath: string, state: State, config: Configuration, why = '') {
  pruneStats(state);
  // scrubbed as a whole too: defence in depth against any field picking up the RPC URL
  const content = scrub(JSON.stringify(renderStatus(state, config), null, 2));

  // write a temp file and rename it, so a reader (nginx, healthcheck) never sees a half-written file
  ensureFileDirectoryExists(filePath);
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, content);
  renameSync(tempPath, filePath);

  // log progress
  Logger.log(`Wrote status JSON to ${filePath} (${content.length} bytes)${why ? ` on ${why}` : ''}.`);
}

/**
 * Writes status.json on startup, after every tick, and right away when the state changes in a way
 * the status page should see (reader blocked or usable again, tx sent or settled, limits hit),
 * instead of only on the timer.
 */
export class StatusReporter {
  private lastKey = '';

  constructor(private config: Configuration, private state: State) {}

  write(why: string) {
    try {
      writeStatusToDisk(this.config.StatusJsonPath, this.state, this.config, why);
      this.lastKey = transitionKey(this.state);
    } catch (err) {
      // a failed status write must not stop the run loop; the healthcheck will notice a stale file
      Logger.error(`Failed writing status JSON: ${describeError(err)}`);
    }
  }

  onTransition(why: string) {
    if (transitionKey(this.state) !== this.lastKey) this.write(`transition: ${why}`);
  }
}

function transitionKey(state: State): string {
  return JSON.stringify([
    state.ReaderStatus,
    state.EthereumSyncStatus,
    state.EthereumLastElectionsTx?.Status,
    state.EthereumLastElectionsTx?.TxHash,
    state.EthereumLastVoteUnreadyTx?.Status,
    state.EthereumLastVoteUnreadyTx?.TxHash,
    state.SpendingLimitReason,
    !!state.SignerError,
    state.EthereumRpcError,
    getBlockedBy(state)?.Component,
  ]);
}

/**
 * Restores what must survive a restart from the previous status.json: the counters the spending
 * limits rely on (otherwise every restart would reset them), vote-unready times, and a tx still in
 * flight (otherwise the next tick would send it again).
 */
export function restoreFromStatusFile(filePath: string, state: State) {
  if (!existsSync(filePath)) return;
  let payload: JsonResponse;
  try {
    payload = JSON.parse(readFileSync(filePath).toString()).Payload;
  } catch (err) {
    Logger.error(`Could not read previous status JSON, starting with empty counters: ${describeError(err)}`);
    return;
  }
  if (!payload || typeof payload !== 'object') return;

  state.EthereumCommittedTxStats = numberRecord(payload.EthereumCommittedTxStats);
  state.EthereumFeesStats = numberRecord(payload.EthereumFeesStats);
  state.EthereumLastVoteUnreadyTime = numberRecord(payload.EthereumLastVoteUnreadyTime);
  const dailyNonce = payload.EthereumDailyNonce;
  if (dailyNonce && typeof dailyNonce.Day === 'string' && Number.isInteger(dailyNonce.Nonce)) {
    state.EthereumDailyNonce = { Day: dailyNonce.Day, Nonce: dailyNonce.Nonce };
  }
  state.EthereumLastElectionsTx = pendingTx(payload.EthereumLastElectionsTx);
  state.EthereumLastVoteUnreadyTx = pendingTx(payload.EthereumLastVoteUnreadyTx);
  if (state.EthereumLastVoteUnreadyTx?.Target) {
    state.EthereumLastVoteUnreadyTx.OnFinal = voteUnreadyOnFinal(state.EthereumLastVoteUnreadyTx.Target, state);
  }
  pruneStats(state);
  Logger.log(
    `Restored from previous status JSON: tx stats ${JSON.stringify(state.EthereumCommittedTxStats)}, fees ${JSON.stringify(
      state.EthereumFeesStats
    )}, pending txs: ${[state.EthereumLastElectionsTx, state.EthereumLastVoteUnreadyTx]
      .filter((tx) => tx)
      .map((tx) => tx?.TxHash)}.`
  );
}

// helpers

function numberRecord(value: unknown): { [key: string]: number } {
  const out: { [key: string]: number } = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, v] of Object.entries(value as object)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

// only a tx still in flight is restored: a reverted one would wedge a fresh process in need-reset
function pendingTx(value: JsonResponse): EthereumTxStatus | undefined {
  if (!value || value.Status !== 'pending' || typeof value.TxHash !== 'string' || !value.TxHash) return undefined;
  if (!['ready-to-sync', 'ready-for-committee', 'vote-unready'].includes(value.Type)) return undefined;
  if (!['discount', 'recommended'].includes(value.GasPriceStrategy)) return undefined;
  for (const key of ['LastPollTime', 'SendTime', 'GasPrice', 'EthBlock']) {
    if (typeof value[key] !== 'number') return undefined;
  }
  return {
    LastPollTime: value.LastPollTime,
    Type: value.Type,
    SendTime: value.SendTime,
    GasPriceStrategy: value.GasPriceStrategy,
    GasPrice: value.GasPrice,
    Status: 'pending',
    TxHash: value.TxHash,
    EthBlock: value.EthBlock,
    ...(typeof value.Target === 'string' ? { Target: value.Target } : {}),
  };
}

function pruneStats(state: State) {
  state.EthereumCommittedTxStats = keepLatest(state.EthereumCommittedTxStats, KEEP_DAILY_STATS);
  state.EthereumFeesStats = keepLatest(state.EthereumFeesStats, KEEP_FEE_PERIODS);
}

// keys are ISO dates / 10-day periods, so they sort by time
function keepLatest(record: { [key: string]: number }, count: number) {
  const keys = Object.keys(record).sort();
  if (keys.length <= count) return record;
  const out: { [key: string]: number } = {};
  for (const key of keys.slice(-count)) out[key] = record[key];
  return out;
}

export function getBlockedBy(state: State): BlockedBy | undefined {
  if (state.ReaderStatus !== 'ok' && state.ReaderStatus !== 'unknown') {
    return { Component: 'ethereum-reader', Reason: state.ReaderReason || state.ReaderStatus };
  }
  if (state.ReaderStatus === 'ok' && state.EthereumSyncStatus === 'out-of-sync' && state.ManagementRefTime > 0) {
    return { Component: 'ethereum-reader', Reason: `RefTime ${getCurrentClockTime() - state.ManagementRefTime}s old` };
  }
  if (state.SignerError) {
    return { Component: 'signer', Reason: state.SignerError.Message };
  }
  if (state.EthereumRpcError) {
    return { Component: 'ethereum-rpc', Reason: state.EthereumRpcError };
  }
  return undefined;
}

function getHeadline(state: State, blockedBy?: BlockedBy): string {
  if (state.LastTickTime === 0) return 'Starting';
  if (blockedBy) return `Blocked by ${blockedBy.Component}: ${blockedBy.Reason}`;
  if (state.SpendingLimitReason) return 'Spending limit reached';
  switch (state.EthereumSyncStatus) {
    case 'operational':
      return 'Operational';
    case 'tx-pending':
      return `Tx pending: ${[state.EthereumLastElectionsTx, state.EthereumLastVoteUnreadyTx]
        .filter((tx) => tx?.Status === 'pending')
        .map((tx) => tx?.Type)
        .join(', ')}`;
    case 'need-reset':
      return 'Needs reset';
    case 'out-of-sync':
      return 'Out of sync';
  }
  return 'Unknown';
}

// one line, most important first; the v5 status page shows the first ", "-separated parts
function getStatusText(state: State, blockedBy?: BlockedBy) {
  const res = [];
  res.push(getHeadline(state, blockedBy));
  res.push(`EthSyncStatus = ${state.EthereumSyncStatus}`);
  res.push(state.EtherBalance ? `EtherBalance = ${weiToEth(state.EtherBalance)} ETH` : `EtherBalance = unknown`);
  const tenDays = getTenDayPeriod();
  res.push(`TxFeesIn10Days = ${(state.EthereumFeesStats[tenDays] ?? 0).toFixed(6)} ETH`);
  res.push(`TxsToday = ${state.EthereumCommittedTxStats[getToday()] ?? 0}`);
  return res.join(', ');
}

// empty only when healthy: anything the writer cannot vouch for is an error
function getErrorText(state: State, config: Configuration, blockedBy?: BlockedBy) {
  const res = [];
  if (state.LastTickTime === 0) {
    res.push(`Starting: first check not completed yet.`);
  }
  if (blockedBy) {
    res.push(`Blocked by ${blockedBy.Component}: ${blockedBy.Reason}.`);
  }
  if (state.LastTickError) {
    res.push(`Error: ${state.LastTickError}.`);
  }
  if (state.EthereumSyncStatus == 'need-reset') {
    res.push(`Service requires reset.`);
  }
  if (!state.EtherBalance) {
    if (state.LastTickTime > 0) res.push(`Eth balance unknown.`);
  } else if (BigInt(state.EtherBalance) < MINIMUM_ALLOWED_ETH_BALANCE_WEI) {
    res.push(
      `Eth balance below ${weiToEth(MINIMUM_ALLOWED_ETH_BALANCE_WEI.toString(10))}: ${weiToEth(state.EtherBalance)} ETH.`
    );
  }
  if (state.EthereumSyncStatus == 'out-of-sync' && state.LastTickTime > 0 && !blockedBy) {
    res.push(`Eth is out of sync.`);
  }
  if (state.SpendingLimitReason) {
    res.push(`Spending limit, not sending: ${state.SpendingLimitReason}.`);
  }
  if (state.EthereumConsecutiveTxTimeouts > TX_CONSECUTIVE_TIMEOUTS) {
    res.push(`Too many pending tx timeouts: ${state.EthereumConsecutiveTxTimeouts}.`);
  }
  const tenDays = getTenDayPeriod();
  if ((state.EthereumFeesStats[tenDays] ?? 0) > config.EthereumMaxFeesPerTenDaysEth) {
    res.push(
      `Tx fees in 10 days above ${config.EthereumMaxFeesPerTenDaysEth}: ${(state.EthereumFeesStats[tenDays] ?? 0).toFixed(
        6
      )} ETH.`
    );
  }
  const electionsTxFailedAgo = getCurrentClockTime() - (state.EthereumLastElectionsTx?.SendTime ?? 0);
  if (state.EthereumLastElectionsTx?.Status == 'failed-send' && electionsTxFailedAgo < TX_SEND_FAILURE_TIMEOUT) {
    res.push(`Elections tx failed ${electionsTxFailedAgo} seconds ago.`);
  }
  const voteUnreadyTxFailedAgo = getCurrentClockTime() - (state.EthereumLastVoteUnreadyTx?.SendTime ?? 0);
  if (state.EthereumLastVoteUnreadyTx?.Status == 'failed-send' && voteUnreadyTxFailedAgo < TX_SEND_FAILURE_TIMEOUT) {
    res.push(`vote unready tx failed ${voteUnreadyTxFailedAgo} seconds ago.`);
  }
  return res.join(' ');
}
