import test from 'ava';
import nock from 'nock';
import { readManagementStatus, updateGuardianRegistrationContract, isGuardianRegistered, fetchManagementStatusWithTimeout } from './management';
import { State } from '../model/state';
import _ from 'lodash';
import { getCurrentClockTime, jsonStringifyComplexTypes } from '../helpers';
import Web3 from 'web3';

const myOrbsAddress = '86544bdd6c8b957cd198252c45fa215fc3892126';
const exampleManagementServiceEndpoint = 'http://management-service:8080';
const managementStatusPath = '/status';
const validManagementStatusResponse = {
  ExtraField: 'something',
  Payload: {
    CurrentRefTime: 1592400033,
    CurrentRefBlock: 3454,
    CurrentCommittee: [
      {
        EthAddress: '8a670ddc1910c27278ab7db2a148a0dccc6bf0f5',
        Weight: 40000,
        Name: 'Guardian3',
      },
      {
        EthAddress: 'e16e965a4cc3fcd597ecdb9cd9ab8f3e6a750ac9',
        Weight: 30000,
        Name: 'Guardian1',
      },
    ],
    CurrentCandidates: [
      {
        EthAddress: 'cb6642be414696f77336dae06fed3775f08de0ea',
        IsStandby: true,
        Name: 'Guardian4',
      },
      {
        EthAddress: '51baa09f2f7dfc7a0f65886b68720958d389cac7',
        IsStandby: true,
        Name: 'Guardian2',
      },
      {
        EthAddress: '29ce860a2247d97160d6dfc087a15f41e2349087',
        IsStandby: true,
        Name: 'Guardian0',
      },
    ],
    CurrentTopology: [
      {
        EthAddress: '29ce860a2247d97160d6dfc087a15f41e2349087',
        OrbsAddress: '16fcf728f8dc3f687132f2157d8379c021a08c12',
        Ip: '41.206.134.10',
        Port: 0,
        Name: 'Guardian0',
      },
      {
        EthAddress: 'e16e965a4cc3fcd597ecdb9cd9ab8f3e6a750ac9',
        OrbsAddress: '86544bdd6c8b957cd198252c45fa215fc3892126',
        Ip: '225.110.150.90',
        Port: 0,
        Name: 'Guardian1',
      },
      {
        EthAddress: '51baa09f2f7dfc7a0f65886b68720958d389cac7',
        OrbsAddress: '174dc3b45bdbbc32aa0b95e64d0247ce99b08f69',
        Ip: '81.186.160.159',
        Port: 0,
        Name: 'Guardian2',
      },
      {
        EthAddress: '8a670ddc1910c27278ab7db2a148a0dccc6bf0f5',
        OrbsAddress: '7c2300d32ebf4a6ae9edf95f4f57ab5a07488c2e',
        Ip: '138.103.13.220',
        Port: 0,
        Name: 'Guardian3',
      },
      {
        EthAddress: 'cb6642be414696f77336dae06fed3775f08de0ea',
        OrbsAddress: '33546759bdcfb5c753a4102b86b3e73e714d5213',
        Ip: '203.102.66.190',
        Port: 0,
        Name: 'Guardian4',
      },
    ],
    CurrentContractAddress:{
      guardiansRegistration:'ce97f8c79228c53b8b9ad86800a493d1e7e5d1e3'
    },
    Guardians: {
      '29ce860a2247d97160d6dfc087a15f41e2349087': {
        EthAddress: '29ce860a2247d97160d6dfc087a15f41e2349087',
        OrbsAddress: '16fcf728f8dc3f687132f2157d8379c021a08c12',
        Ip: '41.206.134.10',
        EffectiveStake: 10000,
        ElectionsStatus: {
          LastUpdateTime: 1592400001,
          ReadyToSync: true,
          ReadyForCommittee: true,
          TimeToStale: 5000,
        },
        Name: 'Guardian0',
        Website: 'Guardian0-website',
        Contact: 'Guardian0-contact',
      },
      e16e965a4cc3fcd597ecdb9cd9ab8f3e6a750ac9: {
        // that's me
        EthAddress: 'e16e965a4cc3fcd597ecdb9cd9ab8f3e6a750ac9',
        OrbsAddress: '86544bdd6c8b957cd198252c45fa215fc3892126',
        Ip: '225.110.150.90',
        EffectiveStake: 20000,
        ElectionsStatus: {
          LastUpdateTime: 1592400002,
          ReadyToSync: true,
          ReadyForCommittee: true,
          TimeToStale: 604800,
        },
        Name: 'Guardian1',
        Website: 'Guardian1-website',
        Contact: 'Guardian1-contact',
      },
      '51baa09f2f7dfc7a0f65886b68720958d389cac7': {
        EthAddress: '51baa09f2f7dfc7a0f65886b68720958d389cac7',
        OrbsAddress: '174dc3b45bdbbc32aa0b95e64d0247ce99b08f69',
        Ip: '81.186.160.159',
        EffectiveStake: 30000,
        ElectionsStatus: {
          LastUpdateTime: 1592400001,
          ReadyToSync: true,
          ReadyForCommittee: false,
          TimeToStale: 86400,
        },
        Name: 'Guardian2',
        Website: 'Guardian2-website',
        Contact: 'Guardian2-contact',
      },
      '8a670ddc1910c27278ab7db2a148a0dccc6bf0f5': {
        EthAddress: '8a670ddc1910c27278ab7db2a148a0dccc6bf0f5',
        OrbsAddress: '7c2300d32ebf4a6ae9edf95f4f57ab5a07488c2e',
        Ip: '138.103.13.220',
        EffectiveStake: 40000,
        ElectionsStatus: {
          LastUpdateTime: 1592400001,
          ReadyToSync: true,
          ReadyForCommittee: true,
          TimeToStale: 604800,
        },
        Name: 'Guardian3',
        Website: 'Guardian3-website',
        Contact: 'Guardian3-contact',
      },
      cb6642be414696f77336dae06fed3775f08de0ea: {
        EthAddress: 'cb6642be414696f77336dae06fed3775f08de0ea',
        OrbsAddress: '33546759bdcfb5c753a4102b86b3e73e714d5213',
        Ip: '203.102.66.190',
        EffectiveStake: 50000,
        ElectionsStatus: {
          LastUpdateTime: 1592400001,
          ReadyToSync: true,
          ReadyForCommittee: false,
          TimeToStale: 0,
        },
        Name: 'Guardian4',
        Website: 'Guardian4-website',
        Contact: 'Guardian4-contact',
      },
    },
    ExtraField: 'something',
  },
};

test.serial.afterEach.always(() => {
  nock.cleanAll();
});

test.serial('reads data from valid ManagementStatus', async (t) => {
  const state = new State();
  nock(exampleManagementServiceEndpoint)
    .get(managementStatusPath)
    .reply(200, JSON.stringify(validManagementStatusResponse));
  t.true(await readManagementStatus(exampleManagementServiceEndpoint, myOrbsAddress, state));
  t.is(state.ReaderStatus, 'ok');

  t.log('state:', jsonStringifyComplexTypes(state));

  t.assert(getCurrentClockTime() - state.ManagementLastPollTime < 5);
  t.is(state.ManagementRefTime, 1592400033);
  t.is(state.ManagementEthRefBlock, 3454);
  t.deepEqual(state.ManagementEthToOrbsAddress, {
    '29ce860a2247d97160d6dfc087a15f41e2349087': '16fcf728f8dc3f687132f2157d8379c021a08c12',
    e16e965a4cc3fcd597ecdb9cd9ab8f3e6a750ac9: '86544bdd6c8b957cd198252c45fa215fc3892126',
    '51baa09f2f7dfc7a0f65886b68720958d389cac7': '174dc3b45bdbbc32aa0b95e64d0247ce99b08f69',
    '8a670ddc1910c27278ab7db2a148a0dccc6bf0f5': '7c2300d32ebf4a6ae9edf95f4f57ab5a07488c2e',
    cb6642be414696f77336dae06fed3775f08de0ea: '33546759bdcfb5c753a4102b86b3e73e714d5213',
  });

  t.is(state.ManagementInCommittee, true);
  t.is(state.ManagementIsStandby, false);
  t.deepEqual(state.ManagementMyElectionsStatus, {
    LastUpdateTime: 1592400002,
    ReadyToSync: true,
    ReadyForCommittee: true,
    TimeToStale: 604800,
  });
  t.deepEqual(state.ManagementOthersElectionsStatus, {
    '29ce860a2247d97160d6dfc087a15f41e2349087': {
      LastUpdateTime: 1592400001,
      ReadyToSync: true,
      ReadyForCommittee: true,
      TimeToStale: 5000,
    },
    '51baa09f2f7dfc7a0f65886b68720958d389cac7': {
      LastUpdateTime: 1592400001,
      ReadyToSync: true,
      ReadyForCommittee: false,
      TimeToStale: 86400,
    },
    '8a670ddc1910c27278ab7db2a148a0dccc6bf0f5': {
      LastUpdateTime: 1592400001,
      ReadyToSync: true,
      ReadyForCommittee: true,
      TimeToStale: 604800,
    },
    cb6642be414696f77336dae06fed3775f08de0ea: {
      LastUpdateTime: 1592400001,
      ReadyToSync: true,
      ReadyForCommittee: false,
      TimeToStale: 0,
    },
  });
  t.assert(
    _.isMatch(state.ManagementCurrentCommittee, [
      {
        EthAddress: '8a670ddc1910c27278ab7db2a148a0dccc6bf0f5',
        Weight: 40000,
      },
      {
        EthAddress: 'e16e965a4cc3fcd597ecdb9cd9ab8f3e6a750ac9',
        Weight: 30000,
      },
    ])
  );
  t.assert(
    _.isMatch(state.ManagementCurrentStandbys, [
      {
        EthAddress: 'cb6642be414696f77336dae06fed3775f08de0ea',
      },
      {
        EthAddress: '51baa09f2f7dfc7a0f65886b68720958d389cac7',
      },
      {
        EthAddress: '29ce860a2247d97160d6dfc087a15f41e2349087',
      },
    ])
  );
  t.assert(
    _.isMatch(state.ManagementCurrentTopology, [
      {
        EthAddress: '29ce860a2247d97160d6dfc087a15f41e2349087',
      },
      {
        EthAddress: 'e16e965a4cc3fcd597ecdb9cd9ab8f3e6a750ac9',
      },
      {
        EthAddress: '51baa09f2f7dfc7a0f65886b68720958d389cac7',
      },
      {
        EthAddress: '8a670ddc1910c27278ab7db2a148a0dccc6bf0f5',
      },
      {
        EthAddress: 'cb6642be414696f77336dae06fed3775f08de0ea',
      },
    ])
  );
});

test.serial('my orbsAddress not found in ManagementStatus', async (t) => {
  const state = new State();
  nock(exampleManagementServiceEndpoint)
    .get(managementStatusPath)
    .reply(200, JSON.stringify(validManagementStatusResponse));
  const unknownOrbsAddress = '77777777008b957cd198252c45fa215fc3892126';
  await readManagementStatus(exampleManagementServiceEndpoint, unknownOrbsAddress, state);

  t.log('state:', jsonStringifyComplexTypes(state));

  t.is(state.ManagementInCommittee, false);
  t.is(state.ManagementIsStandby, false);
  t.falsy(state.ManagementMyElectionsStatus);
  t.deepEqual(state.ManagementOthersElectionsStatus, {
    '29ce860a2247d97160d6dfc087a15f41e2349087': {
      LastUpdateTime: 1592400001,
      ReadyToSync: true,
      ReadyForCommittee: true,
      TimeToStale: 5000,
    },
    '51baa09f2f7dfc7a0f65886b68720958d389cac7': {
      LastUpdateTime: 1592400001,
      ReadyToSync: true,
      ReadyForCommittee: false,
      TimeToStale: 86400,
    },
    '8a670ddc1910c27278ab7db2a148a0dccc6bf0f5': {
      LastUpdateTime: 1592400001,
      ReadyToSync: true,
      ReadyForCommittee: true,
      TimeToStale: 604800,
    },
    cb6642be414696f77336dae06fed3775f08de0ea: {
      LastUpdateTime: 1592400001,
      ReadyToSync: true,
      ReadyForCommittee: false,
      TimeToStale: 0,
    },
    e16e965a4cc3fcd597ecdb9cd9ab8f3e6a750ac9: {
      LastUpdateTime: 1592400002,
      ReadyToSync: true,
      ReadyForCommittee: true,
      TimeToStale: 604800,
    },
  });
});

test.serial('my elections status not found in ManagementStatus', async (t) => {
  const state = new State();
  const partialResponse = _.cloneDeep(validManagementStatusResponse);
  delete partialResponse.Payload.Guardians['e16e965a4cc3fcd597ecdb9cd9ab8f3e6a750ac9'].ElectionsStatus;
  nock(exampleManagementServiceEndpoint).get(managementStatusPath).reply(200, JSON.stringify(partialResponse));
  await readManagementStatus(exampleManagementServiceEndpoint, myOrbsAddress, state);

  t.log('state:', jsonStringifyComplexTypes(state));

  t.falsy(state.ManagementMyElectionsStatus);
  t.deepEqual(state.ManagementOthersElectionsStatus, {
    '29ce860a2247d97160d6dfc087a15f41e2349087': {
      LastUpdateTime: 1592400001,
      ReadyToSync: true,
      ReadyForCommittee: true,
      TimeToStale: 5000,
    },
    '51baa09f2f7dfc7a0f65886b68720958d389cac7': {
      LastUpdateTime: 1592400001,
      ReadyToSync: true,
      ReadyForCommittee: false,
      TimeToStale: 86400,
    },
    '8a670ddc1910c27278ab7db2a148a0dccc6bf0f5': {
      LastUpdateTime: 1592400001,
      ReadyToSync: true,
      ReadyForCommittee: true,
      TimeToStale: 604800,
    },
    cb6642be414696f77336dae06fed3775f08de0ea: {
      LastUpdateTime: 1592400001,
      ReadyToSync: true,
      ReadyForCommittee: false,
      TimeToStale: 0,
    },
  });
});

test.serial('no ManagementStatus response from management service', async (t) => {
  const state = new State();
  t.false(await readManagementStatus(exampleManagementServiceEndpoint, myOrbsAddress, state));
  t.is(state.ReaderStatus, 'unreachable');
  t.is(state.ManagementLastPollTime, 0);
});

test.serial('404 ManagementStatus response from management service', async (t) => {
  const state = new State();
  nock(exampleManagementServiceEndpoint).get(managementStatusPath).reply(404);
  t.false(await readManagementStatus(exampleManagementServiceEndpoint, myOrbsAddress, state));
  t.is(state.ReaderStatus, 'unreachable');
  t.is(state.ReaderReason, 'HTTP 404');
});

test.serial('invalid JSON format ManagementStatus response from management service', async (t) => {
  const state = new State();
  nock(exampleManagementServiceEndpoint)
    .get(managementStatusPath)
    .reply(200, JSON.stringify(validManagementStatusResponse) + '}}}');
  t.false(await readManagementStatus(exampleManagementServiceEndpoint, myOrbsAddress, state));
  t.is(state.ReaderStatus, 'invalid');
});

test.serial('partial ManagementStatus response from management service', async (t) => {
  const state = new State();
  const partialResponse = _.cloneDeep(validManagementStatusResponse);
  delete partialResponse.Payload.CurrentRefTime;
  nock(exampleManagementServiceEndpoint).get(managementStatusPath).reply(200, JSON.stringify(partialResponse));
  t.false(await readManagementStatus(exampleManagementServiceEndpoint, myOrbsAddress, state));
  t.is(state.ReaderStatus, 'invalid');
  t.is(state.ManagementRefTime, 0);
});

// evm-reader v5.3.1 shapes

function withSync(sync: object | undefined, error?: string) {
  const res = _.cloneDeep(validManagementStatusResponse) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (sync) res.Payload.Sync = sync;
  if (error !== undefined) res.Error = error;
  return res;
}

const syncing = {
  State: 'syncing',
  Source: 'full',
  ResumedFromBlock: null,
  FirstBlock: 100,
  CurrentBlock: 520,
  TargetBlock: 1100,
  Progress: 0.42,
  BlocksPerSecond: 12.5,
  EtaSeconds: 46,
};

test.serial('a syncing reader is not applied: the writer waits', async (t) => {
  const state = new State();
  nock(exampleManagementServiceEndpoint)
    .get(managementStatusPath)
    .reply(200, JSON.stringify(withSync(syncing, 'Syncing: block 520 of 1100 (42%, 46s).')));
  t.false(await readManagementStatus(exampleManagementServiceEndpoint, myOrbsAddress, state));
  t.is(state.ReaderStatus, 'syncing');
  t.is(state.ReaderReason, 'syncing 42%');
  // nothing from the half-synced payload reached the state
  t.is(state.ManagementRefTime, 0);
  t.deepEqual(state.ManagementCurrentCommittee, []);
  t.deepEqual(state.ManagementEthToOrbsAddress, {});
});

test.serial('a syncing reader is not applied even without an Error field', async (t) => {
  const state = new State();
  nock(exampleManagementServiceEndpoint).get(managementStatusPath).reply(200, JSON.stringify(withSync(syncing)));
  t.false(await readManagementStatus(exampleManagementServiceEndpoint, myOrbsAddress, state));
  t.is(state.ReaderStatus, 'syncing');
});

test.serial('a starting reader (placeholder payload) is not applied', async (t) => {
  const state = new State();
  const starting = { ...syncing, Source: null, Progress: 0, TargetBlock: null };
  const res = withSync(starting, 'Starting: state not loaded yet; committee, guardians and blocks are placeholders.');
  delete res.Payload.CurrentContractAddress; // a placeholder payload need not even decode
  nock(exampleManagementServiceEndpoint).get(managementStatusPath).reply(200, JSON.stringify(res));
  t.false(await readManagementStatus(exampleManagementServiceEndpoint, myOrbsAddress, state));
  t.is(state.ReaderStatus, 'syncing');
  t.is(state.ReaderReason, 'starting');
});

test.serial('a synced reader with an Error is not applied', async (t) => {
  const state = new State();
  nock(exampleManagementServiceEndpoint)
    .get(managementStatusPath)
    .reply(200, JSON.stringify(withSync({ ...syncing, State: 'synced', Progress: 1 }, 'Ethereum RefTime is too old (4000 sec ago).')));
  t.false(await readManagementStatus(exampleManagementServiceEndpoint, myOrbsAddress, state));
  t.is(state.ReaderStatus, 'error');
  t.is(state.ReaderReason, 'Ethereum RefTime is too old (4000 sec ago).');
});

test.serial('a synced, healthy reader is applied, and becomes usable again after syncing', async (t) => {
  const state = new State();
  nock(exampleManagementServiceEndpoint).get(managementStatusPath).reply(200, JSON.stringify(withSync(syncing)));
  t.false(await readManagementStatus(exampleManagementServiceEndpoint, myOrbsAddress, state));
  nock(exampleManagementServiceEndpoint)
    .get(managementStatusPath)
    .reply(200, JSON.stringify(withSync({ ...syncing, State: 'synced', Progress: 1 }, '')));
  t.true(await readManagementStatus(exampleManagementServiceEndpoint, myOrbsAddress, state));
  t.is(state.ReaderStatus, 'ok');
  t.is(state.ReaderReason, '');
  t.is(state.ManagementRefTime, 1592400033);
});

test.serial('an unknown sync state is not applied', async (t) => {
  const state = new State();
  nock(exampleManagementServiceEndpoint)
    .get(managementStatusPath)
    .reply(200, JSON.stringify(withSync({ ...syncing, State: 'paused' })));
  t.false(await readManagementStatus(exampleManagementServiceEndpoint, myOrbsAddress, state));
  t.is(state.ReaderStatus, 'invalid');
});

test.serial('a peer that never finishes the body times out (the timeout covers the body)', async (t) => {
  nock(exampleManagementServiceEndpoint).get(managementStatusPath).delayBody(3000).reply(200, '{}');
  const started = Date.now();
  const err = await t.throwsAsync(fetchManagementStatusWithTimeout(exampleManagementServiceEndpoint + managementStatusPath, 200));
  t.true(err.message.includes('timed out after 0.2s'));
  t.true(Date.now() - started < 2000);
});

test.serial('GuardianRegistration::isRegistered', async (t) => {
  const state = new State();
  
  // spin ganache
  nock(/ganache/)
    .post(/.*/, /eth_chainId/)
    .reply(200, JSON.stringify({"jsonrpc":"2.0","id":1,"result":"0x1"}));

  // init web3 manually 
  const HTTP_TIMEOUT_SEC = 20;
  state.web3 = new Web3(
    new Web3.providers.HttpProvider('http://ganache:7545', {
      keepAlive: true,
      timeout: HTTP_TIMEOUT_SEC * 1000,
    })
  );
  t.assert(state.web3);

  state.web3.eth.transactionBlockTimeout = 0; // to stop web3 from polling pending tx
  state.web3.eth.transactionPollingTimeout = 0; // to stop web3 from polling pending tx
  state.web3.eth.transactionConfirmationBlocks = 1; // to stop web3 from polling pending tx
  state.chainId = await state.web3.eth.getChainId();
  //const blockNum = await state.web3.eth.getBlockNumber();
  t.log("blockNum", state.chainId);

  t.assert(typeof updateGuardianRegistrationContract);
  t.assert(typeof isGuardianRegistered)  
});
