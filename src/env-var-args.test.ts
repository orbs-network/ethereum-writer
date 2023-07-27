import test from 'ava';
import { exampleConfig } from './config.example';
import { setConfigEnvVars } from './env-var-args';
import { Configuration } from './config';

test('setConfigEnvVars uses default values when no environment variables', (t) => {
  const input = { ...exampleConfig };
  setConfigEnvVars(input);
  t.deepEqual(input, exampleConfig);
});

/**
 * Converts mockEnv property names to Configuration names
 * Eg. ETHEREUM_ENDPOINT -> EthereumEndpoint
 * */
const camelCaseToSnakeCase = (str: string): string => {
  const result = str.replace(/([a-z])([A-Z])/g, '$1_$2');
  return result.toUpperCase();
};

const mockEnv = {
  MANAGEMENT_SERVICE_ENDPOINT: 'http://localhost:8080',
  ETHEREUM_ENDPOINT: 'https://mainnet.infura.io/v3/1234567890',
  SIGNER_ENDPOINT: 'http://localhost:8081',
  ETHEREUM_ELECTIONS_CONTRACT: '0x1234567890',
  NODE_ORBS_ADDRESS: '555550a3c12e86b4b5f39b213f7e19d048276dae',
  MANAGEMENT_SERVICE_ENDPOINT_SCHEMA: 'http',
  STATUS_JSON_PATH: '/path/to/status.json',
  RUN_LOOP_POLL_TIME_SECONDS: 60,
  ETHEREUM_BALANCE_POLL_TIME_SECONDS: 120,
  ETHEREUM_CAN_JOIN_COMMITTEE_POLL_TIME_SECONDS: 180,
  INVALID_ETHEREUM_SYNC_SECONDS: 240,
  REPUTATION_SAMPLE_SIZE: 20,
  INVALID_REPUTATION_CHECK_THRESHOLD: 2,
  INVALID_REPUTATION_THRESHOLD: 0.5,
  ORBS_REPUTATIONS_CONTRACT: '0x987654321',
  ETHEREUM_SYNC_REQUIREMENT_SECONDS: 300,
  FAIL_TO_SYNC_VCS_TIMEOUT_SECONDS: 360,
  ELECTIONS_REFRESH_WINDOW_SECONDS: 420,
  INVALID_REPUTATION_GRACE_SECONDS: 480,
  VOTE_UNREADY_VALIDITY_SECONDS: 540,
  ELECTIONS_AUDIT_ONLY: false,
  SUSPEND_VOTE_UNREADY: false,
  ETHEREUM_DISCOUNT_GAS_PRICE_FACTOR: 0.8,
  ETHEREUM_DISCOUNT_TX_TIMEOUT_SECONDS: 600,
  ETHEREUM_NON_DISCOUNT_TX_TIMEOUT_SECONDS: 660,
  ETHEREUM_MAX_GAS_PRICE: 1000000000,
  ETHEREUM_MAX_COMMITTED_DAILY_TX: 10,
};

test('setConfigEnvVars uses environment variables when set', (t) => {
  const input: Configuration = { ...exampleConfig };

  // Need to cast to stop TS complaining about number/string mismatch
  process.env = { ...process.env, ...mockEnv } as unknown as NodeJS.ProcessEnv;

  setConfigEnvVars(input);

  for (const key of Object.keys(exampleConfig)) {
    t.assert(input[key as keyof Configuration] === mockEnv[camelCaseToSnakeCase(key) as keyof typeof mockEnv]);
  }
});
