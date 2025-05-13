import { Configuration } from './config';

/**
 * Parse required and optional node configuration from environment variables
 *
 * Environment variables override default configuration values
 *
 * Validation handled later in `validateConfiguration`
 * @param config - The node configuration to update
 * */
export function setConfigEnvVars(config: Configuration): void {
  config.ManagementServiceEndpoint = process.env.MANAGEMENT_SERVICE_ENDPOINT ?? config.ManagementServiceEndpoint;
  config.EthereumEndpoint = process.env.ETHEREUM_ENDPOINT ? process.env.ETHEREUM_ENDPOINT.split(',') : config.EthereumEndpoint;
  config.SignerEndpoint = process.env.SIGNER_ENDPOINT ?? config.SignerEndpoint;
  config.EthereumElectionsContract = process.env.ETHEREUM_ELECTIONS_CONTRACT ?? config.EthereumElectionsContract;
  // TODO: Rename NodeOrbsAddress globally
  config.NodeOrbsAddress = process.env.NODE_ADDRESS ?? config.NodeOrbsAddress;
  config.ManagementServiceEndpointSchema =
    process.env.MANAGEMENT_SERVICE_ENDPOINT_SCHEMA ?? config.ManagementServiceEndpointSchema;
  config.StatusJsonPath = process.env.STATUS_JSON_PATH ?? config.StatusJsonPath;
  config.RunLoopPollTimeSeconds = process.env.RUN_LOOP_POLL_TIME_SECONDS
    ? Number(process.env.RUN_LOOP_POLL_TIME_SECONDS)
    : config.RunLoopPollTimeSeconds;
  config.EthereumBalancePollTimeSeconds = process.env.ETHEREUM_BALANCE_POLL_TIME_SECONDS
    ? Number(process.env.ETHEREUM_BALANCE_POLL_TIME_SECONDS)
    : config.EthereumBalancePollTimeSeconds;
  config.EthereumCanJoinCommitteePollTimeSeconds = process.env.ETHEREUM_CAN_JOIN_COMMITTEE_POLL_TIME_SECONDS
    ? Number(process.env.ETHEREUM_CAN_JOIN_COMMITTEE_POLL_TIME_SECONDS)
    : config.EthereumCanJoinCommitteePollTimeSeconds;
  config.InvalidEthereumSyncSeconds = process.env.INVALID_ETHEREUM_SYNC_SECONDS
    ? Number(process.env.INVALID_ETHEREUM_SYNC_SECONDS)
    : config.InvalidEthereumSyncSeconds;
  config.ReputationSampleSize = process.env.REPUTATION_SAMPLE_SIZE
    ? Number(process.env.REPUTATION_SAMPLE_SIZE)
    : config.ReputationSampleSize;
  config.InvalidReputationCheckThreshold = process.env.INVALID_REPUTATION_CHECK_THRESHOLD
    ? Number(process.env.INVALID_REPUTATION_CHECK_THRESHOLD)
    : config.InvalidReputationCheckThreshold;
  config.InvalidReputationThreshold = process.env.INVALID_REPUTATION_THRESHOLD
    ? Number(process.env.INVALID_REPUTATION_THRESHOLD)
    : config.InvalidReputationThreshold;
  config.OrbsReputationsContract = process.env.ORBS_REPUTATIONS_CONTRACT ?? config.OrbsReputationsContract;
  config.EthereumSyncRequirementSeconds = process.env.ETHEREUM_SYNC_REQUIREMENT_SECONDS
    ? Number(process.env.ETHEREUM_SYNC_REQUIREMENT_SECONDS)
    : config.EthereumSyncRequirementSeconds;
  config.FailToSyncVcsTimeoutSeconds = process.env.FAIL_TO_SYNC_VCS_TIMEOUT_SECONDS
    ? Number(process.env.FAIL_TO_SYNC_VCS_TIMEOUT_SECONDS)
    : config.FailToSyncVcsTimeoutSeconds;
  config.ElectionsRefreshWindowSeconds = process.env.ELECTIONS_REFRESH_WINDOW_SECONDS
    ? Number(process.env.ELECTIONS_REFRESH_WINDOW_SECONDS)
    : config.ElectionsRefreshWindowSeconds;
  config.InvalidReputationGraceSeconds = process.env.INVALID_REPUTATION_GRACE_SECONDS
    ? Number(process.env.INVALID_REPUTATION_GRACE_SECONDS)
    : config.InvalidReputationGraceSeconds;
  config.VoteUnreadyValiditySeconds = process.env.VOTE_UNREADY_VALIDITY_SECONDS
    ? Number(process.env.VOTE_UNREADY_VALIDITY_SECONDS)
    : config.VoteUnreadyValiditySeconds;
  config.ElectionsAuditOnly = process.env.ELECTIONS_AUDIT_ONLY
    ? process.env.ELECTIONS_AUDIT_ONLY === 'true'
    : config.ElectionsAuditOnly;
  config.SuspendVoteUnready = process.env.SUSPEND_VOTE_UNREADY
    ? process.env.SUSPEND_VOTE_UNREADY === 'true'
    : config.SuspendVoteUnready;
  config.EthereumDiscountGasPriceFactor = process.env.ETHEREUM_DISCOUNT_GAS_PRICE_FACTOR
    ? Number(process.env.ETHEREUM_DISCOUNT_GAS_PRICE_FACTOR)
    : config.EthereumDiscountGasPriceFactor;
  config.EthereumDiscountTxTimeoutSeconds = process.env.ETHEREUM_DISCOUNT_TX_TIMEOUT_SECONDS
    ? Number(process.env.ETHEREUM_DISCOUNT_TX_TIMEOUT_SECONDS)
    : config.EthereumDiscountTxTimeoutSeconds;
  config.EthereumNonDiscountTxTimeoutSeconds = process.env.ETHEREUM_NON_DISCOUNT_TX_TIMEOUT_SECONDS
    ? Number(process.env.ETHEREUM_NON_DISCOUNT_TX_TIMEOUT_SECONDS)
    : config.EthereumNonDiscountTxTimeoutSeconds;
  config.EthereumMaxGasPrice = process.env.ETHEREUM_MAX_GAS_PRICE
    ? Number(process.env.ETHEREUM_MAX_GAS_PRICE)
    : config.EthereumMaxGasPrice;
  config.EthereumMaxCommittedDailyTx = process.env.ETHEREUM_MAX_COMMITTED_DAILY_TX
    ? Number(process.env.ETHEREUM_MAX_COMMITTED_DAILY_TX)
    : config.EthereumMaxCommittedDailyTx;
}
