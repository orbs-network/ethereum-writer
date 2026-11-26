import test from 'ava';
import nock from 'nock';
import { State } from '../model/state';
import { clearSecrets, registerSecretUrls } from '../redact';
import { renderStatus } from './status';
import { exampleConfig } from '../config.example';
import { initWeb3Client } from './ethereum';
import { classifyRpcErrorKind, recordProviderErrors, RpcErrorLog } from './rpc-errors';

const fakeRpc = 'http://rpc.example-node.test:8545';
const fakeRpcWithKey = 'http://rpc.example-node.test:8545/v2/k3yK3yK3yK3yK3yK3yK3y';

test.afterEach.always(() => {
  nock.cleanAll();
  clearSecrets();
});

test('classifies like evm-reader', (t) => {
  t.is(classifyRpcErrorKind(new Error('Invalid JSON RPC response: "Too Many Requests"')), 'rate-limit');
  t.is(classifyRpcErrorKind(new Error('JSON-RPC error -32005: daily request count exceeded')), 'rate-limit');
  t.is(classifyRpcErrorKind(new Error('CONNECTION TIMEOUT: timeout of 20000 ms achived')), 'timeout');
  t.is(classifyRpcErrorKind(new Error("CONNECTION ERROR: Couldn't connect to node x.")), 'other');
});

test('counts over the last hour and keeps the last error after later successes', (t) => {
  const log = new RpcErrorLog();
  const start = Date.UTC(2026, 10, 26, 12, 0, 0);
  log.record(new Error('CONNECTION TIMEOUT: timeout of 20000 ms achived'), start);
  log.record(new Error('Invalid JSON RPC response: "Too Many Requests"'), start + 1000);
  log.record(new Error('nonce too low'), start + 2000);
  t.deepEqual(log.counts(start + 3000), { Timeout: 1, RangeLimit: 0, RateLimit: 1, Other: 1 });
  t.is(log.lastAt(), start + 2000);
  t.is(log.last(), 'nonce too low');

  // an hour later the counts are gone, the last error is still there
  t.deepEqual(log.counts(start + 61 * 60 * 1000), { Timeout: 0, RangeLimit: 0, RateLimit: 0, Other: 0 });
  t.is(log.last(), 'nonce too low');
});

test.serial('the last error never contains the RPC URL', (t) => {
  registerSecretUrls([fakeRpcWithKey]);
  const log = new RpcErrorLog();
  log.record(new Error(`CONNECTION ERROR: Couldn't connect to node ${fakeRpcWithKey}.`));
  t.false(log.last().includes('k3yK3y'));
  t.false(log.last().includes('example-node'));
});

test('records transport errors and JSON-RPC error answers, single and batched, and passes them through', (t) => {
  const log = new RpcErrorLog();
  const answers: Array<[unknown, unknown]> = [
    [new Error('CONNECTION TIMEOUT: timeout of 20000 ms achived'), undefined],
    [null, { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'replacement transaction underpriced' } }],
    [null, [{ id: 1, result: '0x1' }, { id: 2, error: { code: -32005, message: 'rate limit' } }]],
    [null, { jsonrpc: '2.0', id: 1, result: '0x1' }],
  ];
  let next = 0;
  const provider = {
    send: (_payload: unknown, callback: (e: unknown, r?: unknown) => void) => callback(...answers[next++]),
  };
  recordProviderErrors(provider, log);

  const seen: unknown[] = [];
  for (let i = 0; i < answers.length; i++) provider.send({}, (e, r) => seen.push(e ?? r));
  t.deepEqual(seen, answers.map(([e, r]) => e ?? r));
  t.deepEqual(log.counts(), { Timeout: 1, RangeLimit: 0, RateLimit: 1, Other: 1 });
});

test.serial('a real web3 call through the provider is recorded and shows in status', async (t) => {
  const state = new State();
  initWeb3Client(fakeRpc, exampleConfig.EthereumElectionsContract, state);
  nock(fakeRpc).post('/').reply(429, 'Too Many Requests');
  await t.throwsAsync(() => state.web3!.eth.getBalance('0x0000000000000000000000000000000000000001'));

  const sync = renderStatus(state, exampleConfig).Payload.EthereumSync;
  t.deepEqual(sync.RpcErrorsLastHour, { Timeout: 0, RangeLimit: 0, RateLimit: 1, Other: 0 });
  t.true(sync.LastRpcError.startsWith('rate-limit: '));
  t.true(sync.LastRpcErrorAt > 0);
});
