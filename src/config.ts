export interface Configuration {
  ManagementServiceEndpoint: string; // does not have default
  EthereumEndpoint: string[]; // does not have default
  SignerEndpoint: string; // does not have default
  EthereumElectionsContract: string; // does not have default
  NodeOrbsAddress: string; // does not have default
  ManagementServiceEndpointSchema: string;
  StatusJsonPath: string;
  RunLoopPollTimeSeconds: number;
  EthereumBalancePollTimeSeconds: number; // multiple of RunLoopPollTimeSeconds
  EthereumCanJoinCommitteePollTimeSeconds: number; // multiple of RunLoopPollTimeSeconds
  InvalidEthereumSyncSeconds: number; // multiple of RunLoopPollTimeSeconds
  ReputationSampleSize: number; // multiple of RunLoopPollTimeSeconds
  InvalidReputationCheckThreshold: number; // multiple of RunLoopPollTimeSeconds
  InvalidReputationThreshold: number; // multiple of RunLoopPollTimeSeconds
  OrbsReputationsContract: string;
  EthereumSyncRequirementSeconds: number;
  FailToSyncVcsTimeoutSeconds: number;
  ElectionsRefreshWindowSeconds: number;
  InvalidReputationGraceSeconds: number;
  VoteUnreadyValiditySeconds: number;
  ElectionsAuditOnly: boolean;
  SuspendVoteUnready: boolean;
  EthereumDiscountGasPriceFactor: number;
  EthereumDiscountTxTimeoutSeconds: number;
  EthereumNonDiscountTxTimeoutSeconds: number;
  EthereumMaxGasPrice: number; // in wei (below 2^54 so number is ok)
  EthereumMaxCommittedDailyTx: number;
}

export const defaultConfiguration = {
  StatusJsonPath: './status/status.json',
  ManagementServiceEndpointSchema: 'http://{{GUARDIAN_IP}}/services/management-service/status',
  RunLoopPollTimeSeconds: 2 * 60,
  OrbsReputationsContract: '_Committee',
  EthereumBalancePollTimeSeconds: 4 * 60 * 60,
  EthereumCanJoinCommitteePollTimeSeconds: 10 * 60,
  InvalidEthereumSyncSeconds: 60 * 60,
  ReputationSampleSize: 100,
  InvalidReputationCheckThreshold: 20,
  InvalidReputationThreshold: 50,
  EthereumSyncRequirementSeconds: 20 * 60,
  FailToSyncVcsTimeoutSeconds: 24 * 60 * 60,
  ElectionsRefreshWindowSeconds: 2 * 60 * 60,
  InvalidReputationGraceSeconds: 30 * 60 * 60,
  VoteUnreadyValiditySeconds: 7 * 24 * 60 * 60,
  ElectionsAuditOnly: false,
  SuspendVoteUnready: true,
  EthereumDiscountGasPriceFactor: 0.75,
  EthereumDiscountTxTimeoutSeconds: 60 * 60,
  EthereumNonDiscountTxTimeoutSeconds: 10 * 60,
  EthereumMaxGasPrice: 500000000000, // 500 gwei
  EthereumMaxCommittedDailyTx: 4,
};

export function validateConfiguration(config: Configuration) {
  if (!config.ManagementServiceEndpoint) {
    throw new Error(`ManagementServiceEndpoint is empty in config.`);
  }
  if (!config.EthereumEndpoint) {
    throw new Error(`EthereumEndpoint is empty in config.`);
  }
  if (!config.SignerEndpoint) {
    throw new Error(`SignerEndpoint is empty in config.`);
  }
  if (!config.EthereumElectionsContract) {
    throw new Error(`EthereumElectionsContract is empty in config.`);
  }
  if (!config.EthereumElectionsContract.startsWith('0x')) {
    throw new Error(`EthereumElectionsContract does not start with "0x".`);
  }
  if (!config.NodeOrbsAddress) {
    throw new Error(`NodeOrbsAddress is empty in config.`);
  }
  if (config.NodeOrbsAddress.startsWith('0x')) {
    throw new Error(`NodeOrbsAddress must not start with "0x".`);
  }
  if (config.NodeOrbsAddress.length != '11f4d0a3c12e86b4b5f39b213f7e19d048276dae'.length) {
    throw new Error(`NodeOrbsAddress has incorrect length: ${config.NodeOrbsAddress.length}.`);
  }
  if (!config.ManagementServiceEndpointSchema) {
    throw new Error(`ManagementServiceEndpointSchema is empty in config.`);
  }
  if (!config.InvalidEthereumSyncSeconds) {
    throw new Error(`InvalidEthereumSyncSeconds is empty in config.`);
  }
  if (typeof config.InvalidEthereumSyncSeconds != 'number') {
    throw new Error(`InvalidEthereumSyncSeconds is not a number.`);
  }
  if (!config.ReputationSampleSize) {
    throw new Error(`ReputationSampleSize is empty in config.`);
  }
  if (typeof config.ReputationSampleSize != 'number') {
    throw new Error(`ReputationSampleSize is not a number.`);
  }
  if (!config.InvalidReputationCheckThreshold) {
    throw new Error(`InvalidReputationCheckThreshold is empty in config.`);
  }
  if (typeof config.InvalidReputationCheckThreshold != 'number') {
    throw new Error(`InvalidReputationCheckThreshold is not a number.`);
  }
  if (!config.InvalidReputationThreshold) {
    throw new Error(`InvalidReputationThreshold is empty in config.`);
  }
  if (typeof config.InvalidReputationThreshold != 'number') {
    throw new Error(`InvalidReputationThreshold is not a number.`);
  }
  if (!config.StatusJsonPath) {
    throw new Error(`StatusJsonPath is empty in config.`);
  }
  if (!config.RunLoopPollTimeSeconds) {
    throw new Error(`RunLoopPollTimeSeconds is empty or zero.`);
  }
  if (typeof config.RunLoopPollTimeSeconds != 'number') {
    throw new Error(`RunLoopPollTimeSeconds is not a number.`);
  }
  if (!config.EthereumBalancePollTimeSeconds) {
    throw new Error(`EthereumBalancePollTimeSeconds is empty or zero.`);
  }
  if (typeof config.EthereumBalancePollTimeSeconds != 'number') {
    throw new Error(`EthereumBalancePollTimeSeconds is not a number.`);
  }
  if (!config.EthereumCanJoinCommitteePollTimeSeconds) {
    throw new Error(`EthereumCanJoinCommitteePollTimeSeconds is empty or zero.`);
  }
  if (typeof config.EthereumCanJoinCommitteePollTimeSeconds != 'number') {
    throw new Error(`EthereumCanJoinCommitteePollTimeSeconds is not a number.`);
  }
  if (!config.OrbsReputationsContract) {
    throw new Error(`OrbsReputationsContract is empty in config.`);
  }
  if (!config.EthereumSyncRequirementSeconds) {
    throw new Error(`EthereumSyncRequirementSeconds is empty or zero.`);
  }
  if (typeof config.EthereumSyncRequirementSeconds != 'number') {
    throw new Error(`EthereumSyncRequirementSeconds is not a number.`);
  }
  if (!config.FailToSyncVcsTimeoutSeconds) {
    throw new Error(`FailToSyncVcsTimeoutSeconds is empty or zero.`);
  }
  if (typeof config.FailToSyncVcsTimeoutSeconds != 'number') {
    throw new Error(`FailToSyncVcsTimeoutSeconds is not a number.`);
  }
  if (!config.ElectionsRefreshWindowSeconds) {
    throw new Error(`ElectionsRefreshWindowSeconds is empty or zero.`);
  }
  if (typeof config.ElectionsRefreshWindowSeconds != 'number') {
    throw new Error(`ElectionsRefreshWindowSeconds is not a number.`);
  }
  if (!config.InvalidReputationGraceSeconds) {
    throw new Error(`InvalidReputationGraceSeconds is empty or zero.`);
  }
  if (typeof config.InvalidReputationGraceSeconds != 'number') {
    throw new Error(`InvalidReputationGraceSeconds is not a number.`);
  }
  if (!config.VoteUnreadyValiditySeconds) {
    throw new Error(`VoteUnreadyValiditySeconds is empty or zero.`);
  }
  if (typeof config.VoteUnreadyValiditySeconds != 'number') {
    throw new Error(`VoteUnreadyValiditySeconds is not a number.`);
  }
  if (typeof config.ElectionsAuditOnly != 'boolean') {
    throw new Error(`ElectionsAuditOnly is not found or not a boolean.`);
  }
  if (typeof config.SuspendVoteUnready != 'boolean') {
    throw new Error(`SuspendVoteUnready is not found or not a boolean.`);
  }
  if (!config.EthereumDiscountGasPriceFactor) {
    throw new Error(`EthereumDiscountGasPriceFactor is empty or zero.`);
  }
  if (typeof config.EthereumDiscountGasPriceFactor != 'number') {
    throw new Error(`EthereumDiscountGasPriceFactor is not a number.`);
  }
  if (!config.EthereumDiscountTxTimeoutSeconds) {
    throw new Error(`EthereumDiscountTxTimeoutSeconds is empty or zero.`);
  }
  if (typeof config.EthereumDiscountTxTimeoutSeconds != 'number') {
    throw new Error(`EthereumDiscountTxTimeoutSeconds is not a number.`);
  }
  if (!config.EthereumNonDiscountTxTimeoutSeconds) {
    throw new Error(`EthereumNonDiscountTxTimeoutSeconds is empty or zero.`);
  }
  if (typeof config.EthereumNonDiscountTxTimeoutSeconds != 'number') {
    throw new Error(`EthereumNonDiscountTxTimeoutSeconds is not a number.`);
  }
  if (!config.EthereumMaxGasPrice) {
    throw new Error(`EthereumMaxGasPrice is empty or zero.`);
  }
  if (typeof config.EthereumMaxGasPrice != 'number') {
    throw new Error(`EthereumMaxGasPrice is not a number.`);
  }
  if (!config.EthereumMaxCommittedDailyTx) {
    throw new Error(`EthereumMaxCommittedDailyTx is empty or zero.`);
  }
  if (typeof config.EthereumMaxCommittedDailyTx != 'number') {
    throw new Error(`EthereumMaxCommittedDailyTx is not a number.`);
  }
}
