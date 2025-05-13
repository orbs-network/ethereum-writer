import {Configuration} from './config';

export const exampleConfig: Configuration = {
  InvalidEthereumSyncSeconds: 60 * 60,
  ReputationSampleSize: 100,
  InvalidReputationCheckThreshold: 20,
  InvalidReputationThreshold: 50,
  ManagementServiceEndpoint: 'http://management-service:8080',
  EthereumEndpoint: ['http://ganache:7545', 'https://rpcman-fastly.orbs.network/rpc?chain=ethereum&appId=guardian&key=888798GHWJ759843GFDSJK759843'],
  SignerEndpoint: 'http://signer:7777',
  EthereumElectionsContract: '0xf8B352100dE45D2668768290504DC89e85766E02',
  NodeOrbsAddress: '11f4d0a3c12e86b4b5f39b213f7e19d048276dae',
  ManagementServiceEndpointSchema: 'http://{{GUARDIAN_IP}}/services/management-service/status',
  StatusJsonPath: './status/status.json',
  RunLoopPollTimeSeconds: 1,
  EthereumBalancePollTimeSeconds: 1,
  EthereumCanJoinCommitteePollTimeSeconds: 1,
  OrbsReputationsContract: 'MockCommittee',
  EthereumSyncRequirementSeconds: 20 * 60,
  FailToSyncVcsTimeoutSeconds: 24 * 60 * 60,
  ElectionsRefreshWindowSeconds: 2 * 60 * 60,
  InvalidReputationGraceSeconds: 6 * 60 * 60,
  VoteUnreadyValiditySeconds: 7 * 24 * 60 * 60,
  ElectionsAuditOnly: false,
  SuspendVoteUnready: false,
  EthereumDiscountGasPriceFactor: 0.75,
  EthereumDiscountTxTimeoutSeconds: 60 * 60,
  EthereumNonDiscountTxTimeoutSeconds: 10 * 60,
  EthereumMaxGasPrice: 150000000000, // 150 gwei
  EthereumMaxCommittedDailyTx: 4
};
