import * as Logger from './logger';
import {getCurrentClockTime, sleep} from './helpers';
import {Configuration} from './config';
import {State} from './model/state';
import {writeStatusToDisk} from './write/status';
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
  readEtherBalance,
  readPendingTransactionStatus,
  sendEthereumElectionsTransaction,
  sendEthereumVoteUnreadyTransaction,
} from './write/ethereum';

export async function runLoop(config: Configuration) {
  // TODO: Yuval- contracts addresses are not updated in case of RegistryChange
  const state = await initializeState(config);
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

  // is registered on netwok (polygon Ethereum)

  // refresh all info from management-service, we don't mind doing this often (2min)
  await readManagementStatus(config.ManagementServiceEndpoint, config.NodeOrbsAddress, state);

  // refresh all vchain reputations to prepare for vote unreadys
  await readAllGuardiansReputations(config, state);

  // refresh pending ethereum transactions status for ready-to-sync / ready-for-comittee
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, config);

  // refresh pending ethereum transactions status for vote unreadys
  await readPendingTransactionStatus(state.EthereumLastVoteUnreadyTx, state, config);

  // warn if we have low ether to pay tx fees, rate according to config
  if (getCurrentClockTime() - state.EthereumBalanceLastPollTime > config.EthereumBalancePollTimeSeconds) {
    await readEtherBalance(config.NodeOrbsAddress, state);
  }

  // first time update isRegistered
  if(state.isRegistered == undefined){
    state.isRegistered = await isGuardianRegistered(state);
  }

  // query ethereum for Elections.canJoinCommittee (call)
  // every 10 min default
  // add update to isRegistered
  let ethereumCanJoinCommittee = false;
  if (
    getCurrentClockTime() - state.EthereumCanJoinCommitteeLastPollTime > config.EthereumCanJoinCommitteePollTimeSeconds &&
    shouldCheckCanJoinCommittee(state, config)) {
      ethereumCanJoinCommittee = await queryCanJoinCommittee(config.NodeOrbsAddress, state);
      state.isRegistered = await isGuardianRegistered(state);
  }

  // STEP 2: update all state machine logic (compute)

  // time entered topology
  const newTimeEnteredTopology = calcTimeEnteredTopology(state, config);
  if (newTimeEnteredTopology != state.TimeEnteredTopology) {
    const logMessage = state.TimeEnteredTopology == -1 ? `Exited topology` : `Entered topology`;
    Logger.log(logMessage);
    state.TimeEnteredTopology = newTimeEnteredTopology;
  }

  // ethereum elections notifications state machine
  const newEthereumSyncStatus = calcEthereumSyncStatus(state, config);
  if (newEthereumSyncStatus != state.EthereumSyncStatus) {
    Logger.log(`EthereumSyncStatus changing from ${state.EthereumSyncStatus} to ${newEthereumSyncStatus}.`);
    state.EthereumSyncStatus = newEthereumSyncStatus;
  }

  // STEP 3: write all data (io) -Yuval: Only if registered in current image's chain network
  
  // send ready-to-sync / ready-for-committee if needed, we don't mind checking this often (2min)
  if (shouldNotifyReadyForCommittee(state, ethereumCanJoinCommittee, config)) {    
    Logger.log(`Decided to send ready-for-committee.`);
    await sendEthereumElectionsTransaction('ready-for-committee', config.NodeOrbsAddress, state, config);
    
  } else if (shouldNotifyReadyToSync(state, config)) {    
    Logger.log(`Decided to send ready-to-sync.`);
    await sendEthereumElectionsTransaction('ready-to-sync', config.NodeOrbsAddress, state, config);    
  }

  // send vote unready if needed, we don't mind checking this often (2min)
  if(state.isRegistered){ 
    const toVoteUnready = getAllGuardiansToVoteUnready(state, config);
    if (toVoteUnready.length > 0) {
      Logger.log(`Decided to send vote unreadys against validators: ${toVoteUnready.map((n) => n.EthAddress)}.`);
      await sendEthereumVoteUnreadyTransaction(toVoteUnready, config.NodeOrbsAddress, state, config);
    }
  }
}

// helpers

async function initializeState(config: Configuration): Promise<State> {
  const state = new State();
  await initWeb3Client(config.EthereumEndpoint, config.EthereumElectionsContract, state);
  state.signer = new Signer(config.SignerEndpoint);
  return state;
}
