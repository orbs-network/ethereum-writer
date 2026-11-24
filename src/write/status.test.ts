import test from 'ava';
import mockFs from 'mock-fs';
import { writeStatusToDisk, restoreFromStatusFile, StatusReporter, renderStatus } from './status';
import { State } from '../model/state';
import { readFileSync, existsSync } from 'fs';
import { exampleConfig } from '../config.example';
import { weiToEth } from '../model/helpers';
import { getCurrentClockTime, getTenDayPeriod, getToday } from '../helpers';
import { clearSecrets, registerSecretUrls } from '../redact';

const path = './status/status.json';

function read() {
  return JSON.parse(readFileSync(path).toString());
}

// a state after its first completed tick, with a healthy reader and enough ether
function healthyState() {
  const state = new State();
  state.LastTickTime = getCurrentClockTime();
  state.ReaderStatus = 'ok';
  state.EthereumSyncStatus = 'operational';
  state.ManagementRefTime = getCurrentClockTime() - 30;
  state.EtherBalance = '110000000000000000'; // 0.11 ETH
  return state;
}

test.serial.afterEach.always(() => {
  mockFs.restore();
  clearSecrets();
});

test.serial('updates and writes Timestamp', (t) => {
  const state = new State();
  mockFs({ [path]: '' });
  writeStatusToDisk(path, state, exampleConfig);

  const writtenContents = read();
  t.log('result:', JSON.stringify(writtenContents, null, 2));

  t.assert(new Date().getTime() - new Date(writtenContents.Timestamp).getTime() < 1000);
  t.false(existsSync(`${path}.tmp`));
});

test.serial('a healthy writer has an empty Error and an Operational Status', (t) => {
  mockFs({ [path]: '' });
  writeStatusToDisk(path, healthyState(), exampleConfig);

  const status = read();
  t.is(status.Error, '');
  t.true(status.Status.startsWith('Operational, EthSyncStatus = operational, EtherBalance = 0.11 ETH'));
  t.is(status.Payload.BlockedBy, undefined);
});

test.serial('unknown is never OK: before the first tick the status is Starting, with an Error', (t) => {
  mockFs({ [path]: '' });
  writeStatusToDisk(path, new State(), exampleConfig);

  const status = read();
  t.true(status.Status.startsWith('Starting'));
  t.true(status.Error.includes('Starting: first check not completed yet.'));
});

test.serial('an unknown ether balance after a tick is an error', (t) => {
  const state = healthyState();
  state.EtherBalance = '';
  mockFs({ [path]: '' });
  writeStatusToDisk(path, state, exampleConfig);

  const status = read();
  t.true(status.Error.includes('Eth balance unknown.'));
  t.true(status.Status.includes('EtherBalance = unknown'));
});

test.serial('eth balance appears in status and error when too low', (t) => {
  const state = healthyState();
  state.EtherBalance = '123';
  mockFs({ [path]: '' });
  writeStatusToDisk(path, state, exampleConfig);

  const writtenContents = read();
  t.assert(writtenContents.Status.includes(weiToEth(state.EtherBalance)));
  t.assert(writtenContents.Error.includes(weiToEth(state.EtherBalance)));
});

test.serial('contains the v5 contract fields and an allowlisted Config', (t) => {
  const state = healthyState();
  state.CurrentVersion = 'v1.9.0';
  state.CurrentCommit = 'abcdef';
  mockFs({ [path]: '' });
  writeStatusToDisk(path, state, exampleConfig);

  const status = read();
  t.deepEqual(Object.keys(status), ['Status', 'Error', 'Timestamp', 'Payload']);
  t.is(typeof status.Payload.Uptime, 'number');
  t.truthy(status.Payload.MemoryUsage.rss);
  t.deepEqual(status.Payload.Version, { Semantic: 'v1.9.0', Commit: 'abcdef' });
  t.deepEqual(status.Payload.Reader, { Status: 'ok', Reason: '' });
  t.is(status.Payload.Config.EthereumEndpoint, undefined);
  t.is(status.Payload.Config.ManagementServiceEndpoint, undefined);
  t.is(status.Payload.Config.SignerEndpoint, undefined);
  t.is(status.Payload.Config.EthereumEndpointConfigured, true);
  t.is(status.Payload.Config.EthereumMaxGasPrice, exampleConfig.EthereumMaxGasPrice);
});

test.serial('never contains the RPC URL or any part of it, even inside errors', (t) => {
  const secret = 'https://eth-mainnet.example-rpc.io/v2/k3yK3yK3yK3yK3yK3yK3y';
  registerSecretUrls([secret]);
  const config = { ...exampleConfig, EthereumEndpoint: secret };
  const state = healthyState();
  // web3 1.2.6 embeds the URL in connection errors
  state.LastTickError = `CONNECTION ERROR: Couldn't connect to node ${secret}.`;
  state.EthereumLastElectionsTx = {
    LastPollTime: 0,
    Type: 'ready-to-sync',
    SendTime: getCurrentClockTime(),
    GasPriceStrategy: 'discount',
    GasPrice: 1,
    Status: 'failed-send',
    TxHash: '',
    EthBlock: 0,
    Error: `Invalid JSON RPC response from eth-mainnet.example-rpc.io/v2/k3yK3yK3yK3yK3yK3yK3y`,
  };
  mockFs({ [path]: '' });
  writeStatusToDisk(path, state, config);

  const content = readFileSync(path).toString();
  t.false(content.includes('k3yK3y'));
  t.false(content.includes('example-rpc.io'));
  t.true(content.includes('[redacted]'));
});

test.serial('a syncing reader is reported as BlockedBy ethereum-reader', (t) => {
  const state = healthyState();
  state.ReaderStatus = 'syncing';
  state.ReaderReason = 'syncing 42%';
  state.EthereumSyncStatus = 'out-of-sync';
  mockFs({ [path]: '' });
  writeStatusToDisk(path, state, exampleConfig);

  const status = read();
  t.deepEqual(status.Payload.BlockedBy, { Component: 'ethereum-reader', Reason: 'syncing 42%' });
  t.true(status.Status.startsWith('Blocked by ethereum-reader: syncing 42%'));
  t.true(status.Error.includes('Blocked by ethereum-reader: syncing 42%.'));
  t.false(status.Error.includes('Eth is out of sync')); // the cause is named once, by BlockedBy
});

test.serial('a stale reader RefTime is reported as BlockedBy ethereum-reader', (t) => {
  const state = healthyState();
  state.EthereumSyncStatus = 'out-of-sync';
  state.ManagementRefTime = getCurrentClockTime() - 3600;
  const status = renderStatus(state, exampleConfig);
  t.is(status.Payload.BlockedBy.Component, 'ethereum-reader');
  t.true(status.Payload.BlockedBy.Reason.startsWith('RefTime 3'));
});

test.serial('a signer failure is reported as BlockedBy signer', (t) => {
  const state = healthyState();
  state.SignerError = { Time: getCurrentClockTime(), Message: 'signer failed: Bad response: Not Found' };
  const status = renderStatus(state, exampleConfig);
  t.deepEqual(status.Payload.BlockedBy, { Component: 'signer', Reason: 'signer failed: Bad response: Not Found' });
  t.not(status.Error, '');
});

test.serial('an RPC failure is reported as BlockedBy ethereum-rpc', (t) => {
  const state = healthyState();
  state.EthereumRpcError = 'unreachable';
  state.LastTickError = 'CONNECTION ERROR';
  const status = renderStatus(state, exampleConfig);
  t.deepEqual(status.Payload.BlockedBy, { Component: 'ethereum-rpc', Reason: 'unreachable' });
});

test.serial('a spending limit is an error', (t) => {
  const state = healthyState();
  state.SpendingLimitReason = 'daily tx limit reached: 4 txs mined from the guardian address today (max 4)';
  const status = renderStatus(state, exampleConfig);
  t.true(status.Status.startsWith('Spending limit reached'));
  t.true(status.Error.includes('Spending limit, not sending: daily tx limit reached'));
});

test.serial('displays the last tick error', (t) => {
  const state = healthyState();
  state.LastTickError = 'oh no!';
  mockFs({ [path]: '' });
  writeStatusToDisk(path, state, exampleConfig);

  t.assert(read().Error.includes('oh no!'));
});

test.serial('StatusReporter writes on transitions only when something changed', (t) => {
  const state = healthyState();
  mockFs({ [path]: '' });
  const reporter = new StatusReporter(exampleConfig, state);
  reporter.write('startup');
  const first = readFileSync(path).toString();

  reporter.onTransition('nothing changed');
  t.is(readFileSync(path).toString(), first);

  state.ReaderStatus = 'syncing';
  state.ReaderReason = 'syncing 1%';
  reporter.onTransition('reader');
  t.deepEqual(read().Payload.BlockedBy, { Component: 'ethereum-reader', Reason: 'syncing 1%' });
});

test.serial('StatusReporter survives a failed write', (t) => {
  const reporter = new StatusReporter({ ...exampleConfig, StatusJsonPath: '/proc/definitely/not/writable/status.json' }, healthyState());
  t.notThrows(() => reporter.write('tick'));
});

test.serial('counters and a pending tx survive a restart', (t) => {
  const before = healthyState();
  before.EthereumCommittedTxStats = { [getToday()]: 3, '2000-01-01': 9 };
  before.EthereumFeesStats = { [getTenDayPeriod()]: 0.05 };
  before.EthereumDailyNonce = { Day: getToday(), Nonce: 40 };
  before.EthereumLastVoteUnreadyTime = { abc: 123 };
  before.EthereumLastElectionsTx = {
    LastPollTime: 1,
    Type: 'ready-for-committee',
    SendTime: 2,
    GasPriceStrategy: 'discount',
    GasPrice: 3,
    Status: 'pending',
    TxHash: '0xhash',
    EthBlock: 0,
  };
  before.EthereumLastVoteUnreadyTx = {
    LastPollTime: 1,
    Type: 'vote-unready',
    SendTime: 2,
    GasPriceStrategy: 'discount',
    GasPrice: 3,
    Status: 'pending',
    TxHash: '0xvote',
    EthBlock: 0,
    Target: 'abc',
  };
  mockFs({ [path]: '' });
  writeStatusToDisk(path, before, exampleConfig);

  const after = new State();
  after.ManagementRefTime = 456;
  restoreFromStatusFile(path, after);
  t.deepEqual(after.EthereumCommittedTxStats, { [getToday()]: 3, '2000-01-01': 9 });
  t.deepEqual(after.EthereumFeesStats, { [getTenDayPeriod()]: 0.05 });
  t.deepEqual(after.EthereumDailyNonce, { Day: getToday(), Nonce: 40 });
  t.deepEqual(after.EthereumLastVoteUnreadyTime, { abc: 123 });
  t.is(after.EthereumLastElectionsTx?.TxHash, '0xhash');
  t.is(after.EthereumLastElectionsTx?.Status, 'pending');
  t.is(after.EthereumLastVoteUnreadyTx?.Target, 'abc');
  after.EthereumLastVoteUnreadyTx?.OnFinal?.();
  t.is(after.EthereumLastVoteUnreadyTime['abc'], 456);
});

test.serial('a reverted tx is not restored (a restart is the reset)', (t) => {
  mockFs({
    [path]: JSON.stringify({
      Payload: { EthereumLastElectionsTx: { Status: 'revert', TxHash: '0x1', Type: 'ready-to-sync' } },
    }),
  });
  const state = new State();
  restoreFromStatusFile(path, state);
  t.is(state.EthereumLastElectionsTx, undefined);
});

test.serial('a missing or corrupt previous status starts with empty counters', (t) => {
  mockFs({ [path]: '{not json' });
  const state = new State();
  t.notThrows(() => restoreFromStatusFile(path, state));
  t.deepEqual(state.EthereumCommittedTxStats, {});

  mockFs({});
  t.notThrows(() => restoreFromStatusFile(path, new State()));
});

test.serial('old stats are pruned', (t) => {
  const state = healthyState();
  for (let day = 1; day <= 28; day++) state.EthereumCommittedTxStats[`2000-02-${String(day).padStart(2, '0')}`] = 1;
  mockFs({ [path]: '' });
  writeStatusToDisk(path, state, exampleConfig);
  t.is(Object.keys(read().Payload.EthereumCommittedTxStats).length, 14);
});
