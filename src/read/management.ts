import _ from 'lodash';
import * as Logger from '../logger';
import {ReaderStatusEnum, State} from '../model/state';
import {array, bool, Decoder, decodeValue, maybe, num, object, record, str} from 'ts-json-decode';
import {getCurrentClockTime} from '../helpers';
import {findEthFromOrbsAddress} from '../model/helpers';
import {getAbiByContractRegistryKey} from '@orbs-network/orbs-ethereum-contracts-v2';
import AbortController from "abort-controller";
import fetch from "node-fetch";
import {describeError, truncate} from '../redact';

const READER_FETCH_TIMEOUT_MS = 30 * 1000;
const PEER_FETCH_TIMEOUT_MS = 5 * 1000;
const MAX_STATUS_BYTES = 20 * 1024 * 1024;
const MAX_REASON_LENGTH = 200;

// update guardianRegistration contract instance and address
export function updateGuardianRegistrationContract(state: State, address:string){
  Logger.log(`updateGuardianRegistrationContract: ${address} `);

  if(!address) {
    Logger.error('guardianRegistrationAddress is not valid')
    return
  }
  // addigment
  state.guardianRegistrationAddress = address;

  const regAbi = getAbiByContractRegistryKey('guardiansRegistration');
  if(!regAbi) {
    Logger.error(`failed to create regApi`);
    return;
  }
  if(!state.web3){
    Logger.error(`web3 is not initialized`);
    return;
  }

  state.guardianRegistration = new state.web3.eth.Contract(regAbi, state.guardianRegistrationAddress);
  if(!state.guardianRegistration)
    Logger.error(`failed to create state.guardianRegistration web3 instance`);
}
/**
 * Reads the local reader's status (ethereum-reader / management-service) into state.
 *
 * Returns true only when the status can be acted on. A reader that is starting or syncing publishes
 * placeholder or half-synced data (committee, guardians, elections status), so it is never applied:
 * the writer waits, and state keeps the last good read. Never throws: failures set ReaderStatus.
 */
export async function readManagementStatus(endpoint: string, myOrbsAddress: string, state: State): Promise<boolean> {
  const url = `${endpoint}/status`;

  let json: unknown;
  try {
    const { status, body } = await fetchText(url, READER_FETCH_TIMEOUT_MS);
    if (status < 200 || status >= 300) return setReader(state, 'unreachable', `HTTP ${status}`);
    try {
      json = JSON.parse(body);
    } catch (_) {
      return setReader(state, 'invalid', `status is not JSON (HTTP ${status})`);
    }
  } catch (err) {
    return setReader(state, 'unreachable', describeError(err, MAX_REASON_LENGTH));
  }

  // gate before strict decoding: a starting reader's placeholder payload need not even decode
  const gate = readerGate(json);
  if (gate) return setReader(state, gate.status, gate.reason);

  let response: ManagementStatusResponse;
  try {
    response = decodeValue(managementStatusResponseDecoder, json);
  } catch (err) {
    return setReader(state, 'invalid', `unexpected status shape: ${describeError(err, MAX_REASON_LENGTH)}`);
  }

  state.ManagementRefTime = response.Payload.CurrentRefTime;
  state.ManagementEthRefBlock = response.Payload.CurrentRefBlock;

  state.ManagementCurrentCommittee = response.Payload.CurrentCommittee;
  state.ManagementCurrentStandbys = _.filter(response.Payload.CurrentCandidates, (node) => node.IsStandby);
  state.ManagementCurrentTopology = response.Payload.CurrentTopology;
  state.ManagementEthToOrbsAddress = _.mapValues(response.Payload.Guardians, (node) => node.OrbsAddress);

  if(state.guardianRegistrationAddress !== response.Payload.CurrentContractAddress.guardiansRegistration){
    updateGuardianRegistrationContract(state, response.Payload.CurrentContractAddress.guardiansRegistration);
  }

  if(!state.myEthGuardianAddress)
    state.myEthGuardianAddress = findEthFromOrbsAddress(myOrbsAddress, state);

  state.ManagementInCommittee = response.Payload.CurrentCommittee.some((node) => node.EthAddress == state.myEthGuardianAddress);
  state.ManagementIsStandby = state.ManagementCurrentStandbys.some((node) => node.EthAddress == state.myEthGuardianAddress);
  state.ManagementMyElectionsStatus = response.Payload.Guardians[state.myEthGuardianAddress]?.ElectionsStatus;
  state.ManagementOthersElectionsStatus = _.mapValues(response.Payload.Guardians, (node) => node.ElectionsStatus);
  delete state.ManagementOthersElectionsStatus[state.myEthGuardianAddress];

  // last to be after all possible exceptions and processing delays
  state.ManagementLastPollTime = getCurrentClockTime();
  setReader(state, 'ok', '');

  // log progress
  Logger.log(`Fetched management service.`);
  return true;
}

/**
 * Decides from the reader's own report whether its data may be used. evm-reader (v5) publishes
 * Payload.Sync.State and sets the top-level Error while starting, syncing, stale or failing; the
 * older management-service sets Error when unhealthy. Any of these means: wait.
 */
export function readerGate(json: unknown): { status: ReaderStatusEnum; reason: string } | undefined {
  if (!json || typeof json !== 'object') return { status: 'invalid', reason: 'status is not a JSON object' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = json as any;
  const sync = j.Payload?.Sync;
  if (sync && typeof sync === 'object' && sync.State !== 'synced') {
    if (sync.State === 'syncing') {
      if (sync.Source === null) return { status: 'syncing', reason: 'starting' };
      const progress = Number(sync.Progress);
      return { status: 'syncing', reason: Number.isFinite(progress) ? `syncing ${Math.floor(progress * 100)}%` : 'syncing' };
    }
    return { status: 'invalid', reason: `unknown sync state: ${truncate(String(sync.State), 40)}` };
  }
  if (j.Error !== undefined && j.Error !== null && j.Error !== '') {
    const error = typeof j.Error === 'string' ? j.Error : JSON.stringify(j.Error);
    return { status: 'error', reason: truncate(error.trim(), MAX_REASON_LENGTH) };
  }
  return undefined;
}

function setReader(state: State, status: ReaderStatusEnum, reason: string): boolean {
  if (status !== state.ReaderStatus || reason !== state.ReaderReason) {
    if (status === 'ok') Logger.log(`Reader is usable again.`);
    else Logger.error(`Reader not usable (${status}): ${reason}. Waiting; no transactions are decided until it is.`);
  }
  state.ReaderStatus = status;
  state.ReaderReason = reason;
  return status === 'ok';
}

// helpers

/** GET with a timeout and a size cap that both cover the body, not just the headers. */
async function fetchText(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await fetch(url, { signal: controller.signal, size: MAX_STATUS_BYTES } as any);
    const body = await res.text();
    return { status: res.status, body };
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`timed out after ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches another guardian's reader status (used for reputations). Peers are untrusted: the whole
 * request, body included, is bounded in time and size, so a slow or huge response cannot stall the run loop.
 */
export async function fetchManagementStatusWithTimeout(url: string, timeout = PEER_FETCH_TIMEOUT_MS) {
  let status = 0;
  try {
    const res = await fetchText(url, timeout);
    status = res.status;
    return decodeValue(managementStatusResponseDecoder, JSON.parse(res.body));
  } catch (err) {
    throw new Error(`Error fetching management status from ${url} (HTTP ${status || 'n/a'}): ${describeError(err, MAX_REASON_LENGTH)}`);
  }
}

export interface ManagementStatusResponse {
  Payload: {
    CurrentRefTime: number;
    CurrentRefBlock: number;
    CurrentCommittee: { EthAddress: string; Weight: number }[];
    CurrentCandidates: { EthAddress: string; IsStandby: boolean }[];
    CurrentTopology: { EthAddress: string , Ip: string }[];
    CurrentContractAddress:{guardiansRegistration:string};
    Guardians: {
      [EthAddress: string]: {
        OrbsAddress: string;
        ElectionsStatus?: {
          LastUpdateTime: number;
          ReadyToSync: boolean;
          ReadyForCommittee: boolean;
          TimeToStale: number;
        };
      };
    };
  };
}

const managementStatusResponseDecoder: Decoder<ManagementStatusResponse> = object({
  Payload: object({
    CurrentRefTime: num,
    CurrentRefBlock: num,
    CurrentCommittee: array(
      object({
        EthAddress: str,
        Weight: num,
      })
    ),
    CurrentCandidates: array(
      object({
        EthAddress: str,
        IsStandby: bool,
      })
    ),
    CurrentTopology: array(
      object({
        EthAddress: str,
        Ip: str,
      })
    ),
    CurrentContractAddress: object({
      guardiansRegistration: str,
    }),

    Guardians: record(
      object({
        OrbsAddress: str,
        ElectionsStatus: maybe(
          object({
            LastUpdateTime: num,
            ReadyToSync: bool,
            ReadyForCommittee: bool,
            TimeToStale: num,
          })
        ),
      })
    ),
  }),
});

export async function isGuardianRegistered(state: State): Promise<boolean> {
  if (!state.myEthGuardianAddress) return false; // if myEthGuardianAddress is empty it means the node is not registered (not present in matic reader)
  return await state.guardianRegistration?.methods.isRegistered(state.myEthGuardianAddress).call();
}
