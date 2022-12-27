import test from 'ava';
import { TestEnvironment } from './driver';
import { join } from 'path';
import { sleep, getToday, getTenDayPeriod } from '../src/helpers';
import {
  deepDataMatcher,
  isValidEtherBalance,
  isPositiveNumber,
  isValidTimeRef,
  isValidBlock,
  isNonEmptyString,
  isPositiveFloat,
  isValidImageVersion,
} from './deep-matcher';

const driver = new TestEnvironment(join(__dirname, 'docker-compose.yml'));
driver.launchServices();

// node is OrbsAddress b1985d8a332bfc903fd437489ea933792fbfa500, EthAddress 98b4d71c78789637364a70f696227ec89e35626c
// node was voted unready, so "ReadyToSync": false, also the node is not standby

test.serial('[E2E] enter committee -> sends vote unready for bad rep', async (t) => {
  t.log('started');
  driver.testLogger = t.log;
  t.timeout(60 * 1000);

  t.log('telling mock to start showing the node in the committee');
  await driver.fetch('management-service', 8080, 'change-mock-state/in-committee');
  await sleep(5000);

  const status = await driver.catJsonInService('app', '/opt/orbs/status/status.json');
  t.log('status:', JSON.stringify(status, null, 2));

  const errors = deepDataMatcher(status.Payload, {
    Uptime: isPositiveNumber,
    MemoryUsage: {
      heapUsed: isPositiveNumber,
      rss: isPositiveNumber,
    },
    EthereumSyncStatus: 'operational',
    EthereumBalanceLastPollTime: isValidTimeRef,
    EtherBalance: isValidEtherBalance,
    EthereumCanJoinCommitteeLastPollTime: isValidTimeRef,
    EthereumConsecutiveTxTimeouts: 0,
    EthereumLastElectionsTx: {
      LastPollTime: isValidTimeRef,
      Type: 'ready-for-committee',
      SendTime: isValidTimeRef,
      GasPriceStrategy: 'discount',
      GasPrice: 30000000000,
      Status: 'final',
      TxHash: isNonEmptyString,
      EthBlock: isValidBlock,
    },
    EthereumLastVoteUnreadyTx: {
      LastPollTime: isValidTimeRef,
      Type: 'vote-unready',
      SendTime: isValidTimeRef,
      GasPriceStrategy: 'discount',
      GasPrice: 30000000000,
      Status: 'final',
      TxHash: isNonEmptyString,
      EthBlock: isValidBlock,
    },
    EthereumLastVoteUnreadyTime: {
      '94fda04016784d0348ec2ece7a9b24e3313885f0': isValidTimeRef,
    },
    EthereumCommittedTxStats: {
      [getToday()]: isPositiveNumber,
    },
    EthereumFeesStats: {
      [getTenDayPeriod()]: isPositiveFloat,
    },
    ManagementLastPollTime: isValidTimeRef,
    ManagementEthRefBlock: 3454,
    ManagementInCommittee: true,
    ManagementIsStandby: false,
    ManagementMyElectionStatus: {
      LastUpdateTime: isValidTimeRef,
      ReadyToSync: false,
      ReadyForCommittee: false,
    },
    TimeEnteredTopology: -1,
  });
  t.deepEqual(errors, []);

  const events = await driver.ethereumPosDriver.elections.web3Contract.getPastEvents('VoteUnreadyCasted');
  t.log('last event:', JSON.stringify(events, null, 2));

  t.assert(events.length == 1);
  t.is(events[0].returnValues.voter.toLowerCase(), '0x98b4d71c78789637364a70f696227ec89e35626c');
  t.is(events[0].returnValues.subject.toLowerCase(), '0x94fda04016784d0348ec2ece7a9b24e3313885f0');
});
