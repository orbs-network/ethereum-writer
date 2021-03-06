import * as Logger from './logger';
import { sleep, getCurrentClockTime } from './helpers';
import { Configuration } from './config';
import { State } from './model/state';
import { writeStatusToDisk } from './write/status';
import { readManagementStatus } from './read/management';
import { readAllVchainReputations } from './read/vchain-reputations';
import { readAllVchainMetrics } from './read/vchain-metrics';
import { calcVchainSyncStatus } from './model/logic-vcsync';
import { calcEthereumSyncStatus } from './model/logic-ethsync';
import {
  shouldNotifyReadyForCommittee,
  shouldNotifyReadyToSync,
  shouldCheckCanJoinCommittee,
  calcTimeEnteredTopology,
} from './model/logic-elections';
import { getAllGuardiansToVoteUnready } from './model/logic-voteunready';
import Signer from 'orbs-signer-client';
import {
  initWeb3Client,
  readEtherBalance,
  readPendingTransactionStatus,
  sendEthereumElectionsTransaction,
  sendEthereumVoteUnreadyTransaction,
  queryCanJoinCommittee,
} from './write/ethereum';

export async function runLoop(config: Configuration) {
  const state = initializeState(config);
  // initialize status.json to make sure healthcheck passes from now on
  writeStatusToDisk(config.StatusJsonPath, state, config);

  for (;;) {
    try {
      // rest (to make sure we don't retry too aggressively on exceptions)
      await sleep(config.RunLoopPollTimeSeconds * 1000);

      // main business logic
      await runLoopTick(config, state);

      // write status.json file, we don't mind doing this often (2min)
      writeStatusToDisk(config.StatusJsonPath, state, config);
    } catch (err) {
      Logger.log('Exception thrown during runLoop, going back to sleep:');
      Logger.error(err.stack);

      // always write status.json file (and pass the error)
      writeStatusToDisk(config.StatusJsonPath, state, config, err);
    }
  }
}

// runs every 2 minutes in prod, 1 second in tests
async function runLoopTick(config: Configuration, state: State) {
  Logger.log('Run loop waking up.');

  // STEP 1: read all data (io)

  // refresh all info from management-service, we don't mind doing this often (2min)
  await readManagementStatus(config.ManagementServiceEndpoint, config.NodeOrbsAddress, state);

  // refresh all vchain metrics to see if they're live and in sync
  await readAllVchainMetrics(config.VirtualChainEndpointSchema, state);

  // refresh all vchain reputations to prepare for vote unreadys
  await readAllVchainReputations(config.VirtualChainEndpointSchema, config.OrbsReputationsContract, state);

  // refresh pending ethereum transactions status for ready-to-sync / ready-for-comittee
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, config);

  // refresh pending ethereum transactions status for vote unreadys
  await readPendingTransactionStatus(state.EthereumLastVoteUnreadyTx, state, config);

  // warn if we have low ether to pay tx fees, rate according to config
  if (getCurrentClockTime() - state.EthereumBalanceLastPollTime > config.EthereumBalancePollTimeSeconds) {
    await readEtherBalance(config.NodeOrbsAddress, state);
  }

  // query ethereum for Elections.canJoinCommittee (call)
  let ethereumCanJoinCommittee = false;
  if (
    getCurrentClockTime() - state.EthereumCanJoinCommitteeLastPollTime >
      config.EthereumCanJoinCommitteePollTimeSeconds &&
    shouldCheckCanJoinCommittee(state, config)
  ) {
    ethereumCanJoinCommittee = await queryCanJoinCommittee(config.NodeOrbsAddress, state);
  }

  // STEP 2: update all state machine logic (compute)

  // time entered topology
  const newTimeEnteredTopology = calcTimeEnteredTopology(state, config);
  if (newTimeEnteredTopology != state.TimeEnteredTopology) {
    const logMessage = state.TimeEnteredTopology == -1 ? `Exited topology` : `Entered topology`;
    Logger.log(logMessage);
    state.TimeEnteredTopology = newTimeEnteredTopology;
  }

  // vchain sync status state machine
  const newVchainSyncStatus = calcVchainSyncStatus(state, config);
  if (newVchainSyncStatus != state.VchainSyncStatus) {
    Logger.log(`VchainSyncStatus changing from ${state.VchainSyncStatus} to ${newVchainSyncStatus}.`);
    state.VchainSyncStatus = newVchainSyncStatus;
  }

  // ethereum elections notifications state machine
  const newEthereumSyncStatus = calcEthereumSyncStatus(state, config);
  if (newEthereumSyncStatus != state.EthereumSyncStatus) {
    Logger.log(`EthereumSyncStatus changing from ${state.EthereumSyncStatus} to ${newEthereumSyncStatus}.`);
    state.EthereumSyncStatus = newEthereumSyncStatus;
  }

  // STEP 3: write all data (io)

  // send ready-to-sync / ready-for-comittee if needed, we don't mind checking this often (2min)
  if (shouldNotifyReadyForCommittee(state, ethereumCanJoinCommittee, config)) {
    Logger.log(`Decided to send ready-for-committee.`);
    await sendEthereumElectionsTransaction('ready-for-committee', config.NodeOrbsAddress, state, config);
  } else if (shouldNotifyReadyToSync(state, config)) {
    Logger.log(`Decided to send ready-to-sync.`);
    await sendEthereumElectionsTransaction('ready-to-sync', config.NodeOrbsAddress, state, config);
  }

  // send vote unreadys if needed, we don't mind checking this often (2min)
  const toVoteUnready = getAllGuardiansToVoteUnready(state, config);
  if (toVoteUnready.length > 0) {
    Logger.log(`Decided to send vote unreadys against validators: ${toVoteUnready.map((n) => n.EthAddress)}.`);
    await sendEthereumVoteUnreadyTransaction(toVoteUnready, config.NodeOrbsAddress, state, config);
  }
}

// helpers

function initializeState(config: Configuration): State {
  const state = new State();
  initWeb3Client(config.EthereumEndpoint, config.EthereumElectionsContract, state);
  state.signer = new Signer(config.SignerEndpoint);
  return state;
}
