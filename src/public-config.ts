import { Configuration } from './config';

// Allowlist of config fields that may be published (status.json is public on v5 nodes, and is logged
// at startup). Anything not listed here is never published. In particular EthereumEndpoint must never
// be added: it carries the RPC provider's API key. The other endpoints are left out too: they are
// internal addresses, and nobody reading the status needs them.
const PUBLIC_FIELDS = [
  'EthereumElectionsContract',
  'NodeOrbsAddress',
  'RunLoopPollTimeSeconds',
  'EthereumBalancePollTimeSeconds',
  'EthereumCanJoinCommitteePollTimeSeconds',
  'InvalidEthereumSyncSeconds',
  'ReputationSampleSize',
  'InvalidReputationCheckThreshold',
  'InvalidReputationThreshold',
  'OrbsReputationsContract',
  'EthereumSyncRequirementSeconds',
  'FailToSyncVcsTimeoutSeconds',
  'ElectionsRefreshWindowSeconds',
  'InvalidReputationGraceSeconds',
  'VoteUnreadyValiditySeconds',
  'ElectionsAuditOnly',
  'SuspendVoteUnready',
  'EthereumDiscountGasPriceFactor',
  'EthereumDiscountTxTimeoutSeconds',
  'EthereumNonDiscountTxTimeoutSeconds',
  'EthereumMaxGasPrice',
  'EthereumMaxCommittedDailyTx',
  'EthereumMaxFeesPerTenDaysEth',
] as const;

export type PublicConfig = Partial<Pick<Configuration, typeof PUBLIC_FIELDS[number]>> & {
  /** Whether an RPC endpoint is configured; never the URL or any part of it. */
  EthereumEndpointConfigured: boolean;
};

export function publicConfig(config: Configuration): PublicConfig {
  const out: { [key: string]: unknown } = {};
  for (const field of PUBLIC_FIELDS) {
    if (config[field] !== undefined) out[field] = config[field];
  }
  out.EthereumEndpointConfigured = !!config.EthereumEndpoint;
  return out as PublicConfig;
}
