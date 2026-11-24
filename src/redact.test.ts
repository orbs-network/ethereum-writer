import test from 'ava';
import { clearSecrets, describeError, registerSecretUrls, scrub, urlSecretFragments } from './redact';
import { publicConfig } from './public-config';
import { exampleConfig } from './config.example';
import { classifyRpcError } from '.';

// fake endpoints, shaped like real provider URLs
const keyInPath = 'https://eth-mainnet.example-rpc.io/v2/k3yK3yK3yK3yK3yK3yK3y';
const keyInQuery = 'https://rpc.example-node.net/eth?apikey=9f8e7d6c5b4a39281706';
const basicAuth = 'https://user1:s3cr3tpass@node.example-host.org:8545/';

test.afterEach.always(() => clearSecrets());

test.serial('scrubs a full URL and every part of it', (t) => {
  registerSecretUrls([keyInPath]);
  for (const text of [
    keyInPath,
    `CONNECTION ERROR: Couldn't connect to node ${keyInPath}.`,
    'host eth-mainnet.example-rpc.io answered 429',
    'path /v2/k3yK3yK3yK3yK3yK3yK3y',
    'key k3yK3yK3yK3yK3yK3yK3y',
  ]) {
    const out = scrub(text);
    t.false(out.includes('k3yK3y'), out);
    t.false(out.includes('example-rpc.io'), out);
  }
});

test.serial('scrubs query keys and basic auth', (t) => {
  registerSecretUrls([keyInQuery, basicAuth]);
  t.false(scrub(`failed: ${keyInQuery}`).includes('9f8e7d6c5b4a39281706'));
  t.false(scrub('apikey=9f8e7d6c5b4a39281706').includes('9f8e7d6c5b4a39281706'));
  t.false(scrub('user1:s3cr3tpass').includes('s3cr3tpass'));
  t.false(scrub('node.example-host.org:8545').includes('example-host'));
});

test.serial('scrubs URL-encoded forms and every URL of a comma-separated value', (t) => {
  registerSecretUrls([`${keyInPath},${keyInQuery}`]);
  t.false(scrub(encodeURIComponent(keyInPath)).includes('k3yK3y'));
  t.false(scrub(keyInQuery).includes('9f8e7d6c5b4a39281706'));
});

test.serial('leaves unrelated text alone', (t) => {
  registerSecretUrls([keyInPath]);
  t.is(scrub('Fetched management service.'), 'Fetched management service.');
  // plain words in the URL path are not secrets
  t.false(urlSecretFragments(keyInPath).includes('v2'));
});

test.serial('describeError is scrubbed and bounded', (t) => {
  registerSecretUrls([keyInPath]);
  const msg = describeError(new Error(`Invalid JSON RPC response from ${keyInPath}: ${'x'.repeat(1000)}`), 100);
  t.false(msg.includes('k3yK3y'));
  t.true(msg.length <= 101);
});

test.serial('stdout and stderr are scrubbed once the scrubber is installed', async (t) => {
  // run in a child so the global stream patch does not leak into other tests
  const { execFileSync } = await import('child_process');
  const script = `
    require('ts-node/register/transpile-only');
    const r = require('./src/redact');
    r.registerSecretUrls([process.env.ETHEREUM_ENDPOINT]);
    r.installOutputScrubber();
    console.log('log', process.env.ETHEREUM_ENDPOINT);
    console.error(new Error("CONNECTION ERROR: Couldn't connect to node " + process.env.ETHEREUM_ENDPOINT).stack);
  `;
  const out = execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, ETHEREUM_ENDPOINT: keyInPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();
  t.false(out.includes('k3yK3y'));
  t.true(out.includes('[redacted]'));
});

test('publicConfig is an allowlist that never includes an endpoint', (t) => {
  const pub = publicConfig({ ...exampleConfig, EthereumEndpoint: keyInPath });
  const text = JSON.stringify(pub);
  t.false(text.includes('k3yK3y'));
  t.false(text.includes('http'));
  t.false('EthereumEndpoint' in pub);
  t.is(pub.EthereumEndpointConfigured, true);
  t.is(pub.EthereumMaxCommittedDailyTx, exampleConfig.EthereumMaxCommittedDailyTx);
});

test('classifyRpcError names web3 connection failures', (t) => {
  t.is(classifyRpcError(new Error(`CONNECTION ERROR: Couldn't connect to node x.`)), 'unreachable');
  t.is(classifyRpcError(new Error('CONNECTION TIMEOUT: timeout of 20000 ms achived')), 'timed out');
  t.is(classifyRpcError(new Error('Invalid JSON RPC response: ""')), 'invalid response');
  t.is(classifyRpcError(new Error('something else')), '');
});
