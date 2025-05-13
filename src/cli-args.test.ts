import test from 'ava';
import mockFs from 'mock-fs';
import { parseArgs } from './cli-args';
import _ from 'lodash';
import { exampleConfig } from './config.example';

let env: NodeJS.ProcessEnv;

test.before(() => {
  env = process.env;
});

test.beforeEach(() => {
  process.env = { ...env };
});

test.afterEach.always(() => {
  process.env = env;
  mockFs.restore();
});

test('parseArgs with no config and no environment variables', (t) => {
  t.throws(() => parseArgs([]));
});

test('parseArgs with no file', (t) => {
  t.throws(() => parseArgs(['--config']));
});

test('parseArgs with environment variables and no config', (t) => {
  const mockMgmtSvcEndpoint = 'http://localhost:8080';
  const mockEthereumEndpoint : string[] = ['https://mainnet.infura.io/v3/1234567890'];
  const mockSignerEndpoint = 'http://localhost:8081';
  const mockEthElectionsContract = '0x1234567890';
  const mockNodeAddress = '555550a3c12e86b4b5f39b213f7e19d048276dae';

  process.env.MANAGEMENT_SERVICE_ENDPOINT = mockMgmtSvcEndpoint;
  process.env.ETHEREUM_ENDPOINT = mockEthereumEndpoint.toString();
  process.env.SIGNER_ENDPOINT = mockSignerEndpoint;
  process.env.ETHEREUM_ELECTIONS_CONTRACT = mockEthElectionsContract;
  process.env.NODE_ADDRESS = mockNodeAddress;

  const output = parseArgs([]);

  t.notThrows(() => parseArgs([]));
  t.assert((output.EthereumEndpoint = mockEthereumEndpoint));
  t.assert((output.ManagementServiceEndpoint = mockMgmtSvcEndpoint));
  t.assert((output.SignerEndpoint = mockSignerEndpoint));
  t.assert((output.EthereumElectionsContract = mockEthElectionsContract));
  t.assert((output.NodeOrbsAddress = mockNodeAddress));
});

test('parseArgs: errors when incomplete env vars set', (t) => {
  const mockMgmtSvcEndpoint = 'http://localhost:8080';
  const mockEthereumEndpoint = 'https://mainnet.infura.io/v3/1234567890';

  process.env.MANAGEMENT_SERVICE_ENDPOINT = mockMgmtSvcEndpoint;
  process.env.ETHEREUM_ENDPOINT = mockEthereumEndpoint;

  t.throws(() => parseArgs([]));
});

test('parseArgs: environment variables override config file', (t) => {
  const mockMgmtSvcEndpoint = 'http://localhost:8080';
  const mockEthereumEndpoint = ['https://mainnet.infura.io/v3/1234567890'];
  const mockSignerEndpoint = 'http://localhost:8081';
  const mockEthElectionsContract = '0x1234567890';
  const mockNodeAddress = '555550a3c12e86b4b5f39b213f7e19d048276dae';

  process.env.MANAGEMENT_SERVICE_ENDPOINT = mockMgmtSvcEndpoint;
  process.env.ETHEREUM_ENDPOINT = mockEthereumEndpoint.toString();
  process.env.SIGNER_ENDPOINT = mockSignerEndpoint;
  process.env.ETHEREUM_ELECTIONS_CONTRACT = mockEthElectionsContract;
  process.env.NODE_ADDRESS = mockNodeAddress;

  mockFs({
    ['./some/file.json']: JSON.stringify(exampleConfig),
  });

  const output = parseArgs(['--config', './some/file.json']);

  t.assert((output.EthereumEndpoint = mockEthereumEndpoint));
  t.assert((output.ManagementServiceEndpoint = mockMgmtSvcEndpoint));
  t.assert((output.SignerEndpoint = mockSignerEndpoint));
  t.assert((output.EthereumElectionsContract = mockEthElectionsContract));
  t.assert((output.NodeOrbsAddress = mockNodeAddress));
});

test('parseArgs custom config file does not exist', (t) => {
  t.throws(() => parseArgs(['--config', './some/file.json']));
});

test('parseArgs custom config file valid', (t) => {
  mockFs({
    ['./some/file.json']: JSON.stringify(exampleConfig),
  });
  t.deepEqual(parseArgs(['--config', './some/file.json']), exampleConfig);
});

test('parseArgs two valid custom config files merged', (t) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mergedConfig: any = _.cloneDeep(exampleConfig);
  mergedConfig.SomeField = 'some value';
  mockFs({
    ['./first/file1.json']: JSON.stringify({ SomeField: 'some value' }),
    ['./second/file2.json']: JSON.stringify(exampleConfig),
  });
  t.deepEqual(parseArgs(['--config', './first/file1.json', './second/file2.json']), mergedConfig);
});

test('parseArgs custom config file invalid JSON format', (t) => {
  mockFs({
    ['./some/file.json']: JSON.stringify(exampleConfig) + '}}}',
  });
  t.throws(() => parseArgs(['--config', './some/file.json']));
});

test('parseArgs custom config file missing ManagementServiceEndpoint', (t) => {
  const partialConfig = _.cloneDeep(exampleConfig);
  delete partialConfig.ManagementServiceEndpoint;
  mockFs({
    ['./some/partial.json']: JSON.stringify(partialConfig),
  });
  t.throws(() => parseArgs(['--config', './some/partial.json']));
});
