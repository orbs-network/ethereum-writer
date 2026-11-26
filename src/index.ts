import * as Logger from './logger';
import {getCurrentClockTime, sleep} from './helpers';
import {Configuration} from './config';
import {State} from './model/state';
import {restoreFromStatusFile, StatusReporter} from './write/status';
import {describeError, describeErrorStack} from './redact';
import { readManagementStatus, isGuardianRegistered } from './read/management';
import {readAllGuardiansReputations} from './read/guardians-reputations';
import {calcEthereumSyncStatus} from './model/logic-ethsync';
import {
  calcTimeEnteredTopology,
  shouldCheckCanJoinCommittee,
  shouldNotifyReadyForCommittee,
  shouldNotifyReadyToSync,
} from './model/logic-elections';
import {getAllGuardiansToVoteUnready} from './model/logic-voteunready';
import Signer from 'orbs-signer-client';
import {
  initWeb3Client,
  queryCanJoinCommittee,
  verifyChain,
  readEtherBalance,
  readPendingTransactionStatus,
  sendEthereumElectionsTransaction,
  sendEthereumVoteUnreadyTransaction,
} from './write/ethereum';

export async function runLoop(config: Configuration) {
  // TODO: Yuval- contracts addresses are not updated in case of RegistryChange
  const state = initializeState(config);
  const status = new StatusReporter(config, state);
  // write status.json right away: the healthcheck passes from now on, and the page sees "Starting"
  status.write('startup');

  for (;;) {
    try {
      // main business logic
      await runLoopTick(config, state, status);
      state.LastTickError = '';
      state.EthereumRpcError = '';
    } catch (err) {
      Logger.log('Exception thrown during runLoop, going back to sleep:');
      Logger.error(describeErrorStack(err));
      state.LastTickError = describeError(err, 300);
      state.EthereumRpcError = classifyRpcError(err);
    }
    state.LastTickTime = getCurrentClockTime();

    // write status.json file, we don't mind doing this often (2min)
    status.write('tick');

    // rest (to make sure we don't retry too aggressively on exceptions)
    await sleep(config.RunLoopPollTimeSeconds * 1000);
  }
}

// runs every 2 minutes in prod, 1 second in tests
async function runLoopTick(config: Configuration, state: State, status: StatusReporter) {
  Logger.log('Run loop waking up.');
  state.SpendingLimitReason = ''; // set again below if a limit still stops a send

  // STEP 1: read all data (io)

  // refresh all info from management-service, we don't mind doing this often (2min)
  const readerUsable = await readManagementStatus(config.ManagementServiceEndpoint, config.NodeOrbsAddress, state);
  status.onTransition('reader');

  // the RPC must be on the expected chain before anything is read from it or signed for it
  const chainOk = await verifyChain(state, config.EthereumChainId, config.EthereumElectionsContract);
  status.onTransition('chain check');
  if (!chainOk) return;

  // refresh pending ethereum transactions status for ready-to-sync / ready-for-comittee
  // (txs already sent are tracked even while the reader cannot be used)
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, config);

  // refresh pending ethereum transactions status for vote unreadys
  await readPendingTransactionStatus(state.EthereumLastVoteUnreadyTx, state, config);

  // warn if we have low ether to pay tx fees, rate according to config
  if (getCurrentClockTime() - state.EthereumBalanceLastPollTime > config.EthereumBalancePollTimeSeconds) {
    await readEtherBalance(config.NodeOrbsAddress, state);
  }

  if (!readerUsable) {
    // the reader says (or shows) that its data is not current: a half-synced committee, guardian list
    // or elections status must never drive a transaction, so decide nothing until it is usable again
    if (state.EthereumSyncStatus != 'need-reset') state.EthereumSyncStatus = 'out-of-sync';
    status.onTransition('reader not usable');
    return;
  }

  // refresh all vchain reputations to prepare for vote unreadys
  await readAllGuardiansReputations(config, state);

  // first time update isRegistered
  if(state.isRegistered == undefined) {
    state.isRegistered = await isGuardianRegistered(state);
  }

  // query ethereum for Elections.canJoinCommittee (call)
  // every 10 min default
  // update to isRegistered
  let ethereumCanJoinCommittee = false;
  if (getCurrentClockTime() - state.EthereumCanJoinCommitteeLastPollTime > config.EthereumCanJoinCommitteePollTimeSeconds ){
    // isRegistered should be updated here
    // under the EthereumCanJoinCommitteeLastPollTime interval
    state.isRegistered = await isGuardianRegistered(state);
    if (shouldCheckCanJoinCommittee(state, config)) {
      // dont send tx if not registered though
      ethereumCanJoinCommittee = await queryCanJoinCommittee(config.NodeOrbsAddress, state);
    }
  }
  // STEP 2: update all state machine logic (compute)

  // time entered topology
  const newTimeEnteredTopology = calcTimeEnteredTopology(state, config);
  if (newTimeEnteredTopology != state.TimeEnteredTopology) {
    const logMessage = newTimeEnteredTopology == -1 ? `Exited topology` : `Entered topology`;
    Logger.log(logMessage);
    state.TimeEnteredTopology = newTimeEnteredTopology;
  }

  // ethereum elections notifications state machine
  const newEthereumSyncStatus = calcEthereumSyncStatus(state, config);
  if (newEthereumSyncStatus != state.EthereumSyncStatus) {
    Logger.log(`EthereumSyncStatus changing from ${state.EthereumSyncStatus} to ${newEthereumSyncStatus}.`);
    state.EthereumSyncStatus = newEthereumSyncStatus;
  }
  status.onTransition('sync status');

  // STEP 3: write all data (io) -Yuval: Only if registered in current image's chain network
  // At most one transaction per tick: every send uses the latest nonce, so a second tx in the same
  // tick would replace (or be rejected against) the first.

  // send ready-to-sync / ready-for-committee if needed, we don't mind checking this often (2min)
  if (shouldNotifyReadyForCommittee(state, ethereumCanJoinCommittee, config)) {
    Logger.log(`Decided to send ready-for-committee.`);
    await sendEthereumElectionsTransaction('ready-for-committee', config.NodeOrbsAddress, state, config);
    status.onTransition('ready-for-committee');
    return;
  } else if (shouldNotifyReadyToSync(state, config)) {
    Logger.log(`Decided to send ready-to-sync.`);
    await sendEthereumElectionsTransaction('ready-to-sync', config.NodeOrbsAddress, state, config);
    status.onTransition('ready-to-sync');
    return;
  }

  // send vote unready if needed, we don't mind checking this often (2min)
  if(state.isRegistered){
    const toVoteUnready = getAllGuardiansToVoteUnready(state, config);
    if (toVoteUnready.length > 0) {
      Logger.log(`Decided to send vote unreadys against validators: ${toVoteUnready.map((n) => n.EthAddress)}.`);
      await sendEthereumVoteUnreadyTransaction(toVoteUnready, config.NodeOrbsAddress, state, config);
      status.onTransition('vote-unready');
    }
  }
}

// helpers

function initializeState(config: Configuration): State {
  const state = new State();
  restoreFromStatusFile(config.StatusJsonPath, state);
  initWeb3Client(config.EthereumEndpoint, config.EthereumElectionsContract, state);
  state.signer = new Signer(config.SignerEndpoint);
  return state;
}

/** Names an Ethereum RPC failure from a web3 error, '' if the error is something else. URL-free. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function classifyRpcError(err: any): string {
  const message = String(err?.message ?? err);
  if (message.includes('CONNECTION ERROR')) return 'unreachable';
  if (message.includes('CONNECTION TIMEOUT')) return 'timed out';
  if (message.includes('Invalid JSON RPC response')) return 'invalid response';
  return '';
}
