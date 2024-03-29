import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';
import * as Orbs from 'orbs-client-sdk';
import { getCurrentClockTime, getCurrentVersion } from '../helpers';
import Signer from 'orbs-signer-client';

export class State {
  // not updated
  ServiceLaunchTime = getCurrentClockTime(); // UTC seconds
  CurrentVersion = getCurrentVersion(); // v1.2.3
  myEthGuardianAddress = '';
  
  // updated by read/management.ts
  ManagementLastPollTime = 0; // UTC seconds
  ManagementRefTime = 0; // UTC seconds
  ManagementEthRefBlock = 0;
  ManagementEthToOrbsAddress: { [EthAddress: string]: string } = {};
  ManagementInCommittee = false;
  ManagementIsStandby = false;
  ManagementMyElectionsStatus?: ManagementElectionsStatus;
  ManagementOthersElectionsStatus: { [EthAddress: string]: ManagementElectionsStatus | undefined } = {};
  ManagementCurrentCommittee: CommitteeMember[] = [];
  ManagementCurrentStandbys: { EthAddress: string }[] = [];
  ManagementCurrentTopology: { EthAddress: string, Ip: string }[] = [];

  // updated by read/vchain-metrics.ts
  VchainMetricsLastPollTime = 0; // UTC seconds
  VchainMetrics: { [VirtualChainId: string]: VchainMetrics } = {};

  // updated by read/vchain-reputations.ts
  ReputationsLastPollTime = 0; // UTC seconds
  Reputations:  Reputations  = {};

  // updated by write/ethereum.ts
  EthereumLastElectionsTx?: EthereumTxStatus;
  EthereumLastVoteUnreadyTx?: EthereumTxStatus;
  EthereumLastVoteUnreadyTime: { [EthAddress: string]: number } = {};
  EthereumBalanceLastPollTime = 0; // UTC seconds
  EtherBalance = ''; // string in wei
  EthereumCanJoinCommitteeLastPollTime = 0; // UTC seconds
  EthereumConsecutiveTxTimeouts = 0;
  EthereumCommittedTxStats: { [day: string]: number } = {};
  EthereumFeesStats: { [month: string]: number } = {}; // number in eth

  // updated by index.ts
  TimeEnteredTopology = -1; // UTC seconds
  EthereumSyncStatus: EthereumSyncStatusEnum = 'out-of-sync';

  // updated by model/logic-voteout.ts
  TimeEnteredBadReputation: { [EthAddress: string]: number } = {};

  // non-serializable objects (lowercase)

  // ethereum clients - updated by write/ethereum.ts
  web3?: Web3;
  signer?: Signer;
  ethereumElectionsContract?: Contract;
  guardianRegistration?: Contract;
  guardianRegistrationAddress?:string;
  

  // orbs clients - updated by read/vchain-reputations.ts
  orbsAccount = Orbs.createAccount();
  orbsClientPerVchain: { [VirtualChainId: string]: Orbs.Client } = {};

  chainId = 1;
  isRegistered:boolean|undefined = undefined;
}

// helpers

export type EthereumSyncStatusEnum = 'out-of-sync' | 'operational' | 'tx-pending' | 'need-reset';

export type Reputations = { [OrbsAddress: string]: number };

export type CommitteeMember = { EthAddress: string; Weight: number };

export interface VchainMetrics {
  LastBlockHeight: number;
  LastBlockTime: number; // UTC seconds (latest contiguous block in the chain - when was it proposed/signed)
  UptimeSeconds: number;
  LastCommitTime: number; // UTC seconds (latest block we synced - when did we sync it)
}

export type GasPriceStrategy = 'discount' | 'recommended';

export interface EthereumTxStatus {
  LastPollTime: number; // UTC seconds
  Type: 'ready-to-sync' | 'ready-for-committee' | 'vote-unready';
  SendTime: number; // UTC seconds
  GasPriceStrategy: GasPriceStrategy;
  GasPrice: number; // wei
  Status: 'pending' | 'final' | 'failed-send' | 'timeout' | 'revert'; // final according to ManagementEthRefBlock
  TxHash: string;
  EthBlock: number;
  OnFinal?: () => void;
}

// taken from management-service/src/model/state.ts
export interface ManagementVirtualChain {
  Expiration: number;
  RolloutGroup: string;
  IdentityType: number;
  Tier: string;
  GenesisRefTime: number;
}

// taken from management-service/src/model/state.ts
export interface ManagementElectionsStatus {
  LastUpdateTime: number;
  ReadyToSync: boolean;
  ReadyForCommittee: boolean;
  TimeToStale: number;
}
