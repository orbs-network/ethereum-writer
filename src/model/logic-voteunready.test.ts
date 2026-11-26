import test from 'ava';
import {State} from './state';
import {getAllGuardiansToVoteUnready} from './logic-voteunready';
import {exampleConfig} from '../config.example';
import {defaultConfiguration} from '../config';
import {getCurrentClockTime, getToday} from '../helpers';

// example state reflects excellent reputations
function getExampleState() {
    const exampleState = new State();
    exampleState.EthereumSyncStatus = 'operational';
    exampleState.ManagementRefTime = getCurrentClockTime() - 10;
    exampleState.ManagementInCommittee = true;
    exampleState.ManagementCurrentCommittee = [
        {EthAddress: 'e1', Weight: 10},
        {EthAddress: 'e2', Weight: 10},
        {EthAddress: 'e3', Weight: 10},
        {EthAddress: 'e4', Weight: 10},
        {EthAddress: 'e5', Weight: 10},
    ];
    exampleState.ManagementEthToOrbsAddress = {e1: 'o1', e2: 'o2', e3: 'o3', e4: 'o4', e5: 'o5'};
    exampleState.Reputations = {o1: 0, o2: 0, o3: 0, o4: 0, o5: 0};

    return exampleState;
}

test('guardian starts having bad reputation in one vc until voted unready', (t) => {
    const state = getExampleState();
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
    t.assert(state.TimeEnteredBadReputation['e3'] == 0);

    state.Reputations['o1'] = 30;
    state.Reputations['o2'] = 10;
    state.Reputations['o3'] = 20; // below minimum threshold
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
    t.assert(state.TimeEnteredBadReputation['e3'] == 0);

    state.Reputations['o1'] = 40;
    state.Reputations['o2'] = 40; // median causes it to be ignored
    state.Reputations['o3'] = 70; // bad
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
    t.assert(state.TimeEnteredBadReputation['e3'] == 0);

    state.Reputations['o1'] = 10;
    state.Reputations['o2'] = 10; // median is now no longer ignored
    state.Reputations['o3'] = 80; // bad
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
    t.assert(state.TimeEnteredBadReputation['e3'] > 1400000000);

    state.Reputations['o1'] = 10;
    state.Reputations['o2'] = 10;
    state.Reputations['o3'] = 10; // now ok
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
    t.assert(state.TimeEnteredBadReputation['e3'] == 0);

    state.Reputations['o1'] = 10;
    state.Reputations['o2'] = 10;
    state.Reputations['o3'] = 70; // bad again
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
    t.assert(state.TimeEnteredBadReputation['e3'] > 1400000000);

    state.TimeEnteredBadReputation['e3'] = getCurrentClockTime() - 2 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);

    state.TimeEnteredBadReputation['e3'] = getCurrentClockTime() - 10 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), [{EthAddress: 'e3', Weight: 10}]);

    state.EthereumLastVoteUnreadyTime['e3'] = getCurrentClockTime() - 2 * 24 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);

    state.EthereumLastVoteUnreadyTime['e3'] = getCurrentClockTime() - 9 * 24 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), [{EthAddress: 'e3', Weight: 10}]);

    state.EthereumLastVoteUnreadyTime['e3'] = getCurrentClockTime() - 2 * 24 * 60 * 60;
    state.ManagementOthersElectionsStatus['e3'] = {
        LastUpdateTime: getCurrentClockTime() - 1 * 24 * 60 * 60,
        ReadyToSync: true,
        ReadyForCommittee: true,
        TimeToStale: 6 * 24 * 60 * 60,
    };
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), [{EthAddress: 'e3', Weight: 10}]);
});

test('more than 1 guardian voted unready', (t) => {
    const state = getExampleState();
    state.Reputations['o1'] = 60; // bad
    state.Reputations['o2'] = 60; // bad
    state.Reputations['o3'] = 10;
    state.Reputations['o4'] = 10;
    state.Reputations['o5'] = 10;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
    t.assert(state.TimeEnteredBadReputation['e2'] > 1400000000);
    t.assert(state.TimeEnteredBadReputation['e1'] > 1400000000);

    state.TimeEnteredBadReputation['e2'] = getCurrentClockTime() - 10 * 60 * 60;
    state.TimeEnteredBadReputation['e1'] = getCurrentClockTime() - 10 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), [
        {EthAddress: 'e1', Weight: 10},
        {EthAddress: 'e2', Weight: 10},
    ]);
});

test('missing reputations for vc does not fail', (t) => {
    const state = getExampleState();
    state.Reputations = {};
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
});

test('guardian which is not in committee is not voted unready', (t) => {
    const state = getExampleState();
    state.Reputations['o1'] = 10;
    state.Reputations['o2'] = 60; // bad
    state.Reputations['o3'] = 10;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
    t.assert(state.TimeEnteredBadReputation['e2'] > 1400000000);

    state.TimeEnteredBadReputation['e2'] = getCurrentClockTime() - 10 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), [{EthAddress: 'e2', Weight: 10}]);

    state.ManagementCurrentCommittee = [
        {EthAddress: 'e1', Weight: 10},
        {EthAddress: 'e7', Weight: 10},
        {EthAddress: 'e3', Weight: 10},
    ];
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
});

test('guardian with unknown orbs address is not voted unready', (t) => {
    const state = getExampleState();
    state.Reputations['o1'] = 10;
    state.Reputations['o2'] = 60; // bad
    state.Reputations['o3'] = 10;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
    t.assert(state.TimeEnteredBadReputation['e2'] > 1400000000);

    state.TimeEnteredBadReputation['e2'] = getCurrentClockTime() - 10 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), [{EthAddress: 'e2', Weight: 10}]);

    delete state.ManagementEthToOrbsAddress['e2'];
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
});

test('only sending vote unreadys if good eth sync, good vchain sync and sender in committee', (t) => {
    const state = getExampleState();
    state.Reputations['o1'] = 10;
    state.Reputations['o2'] = 60; // bad
    state.Reputations['o3'] = 10;
    state.Reputations['o4'] = 10;
    state.Reputations['o5'] = 10;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
    t.assert(state.TimeEnteredBadReputation['e2'] > 1400000000);

    state.TimeEnteredBadReputation['e2'] = getCurrentClockTime() - 10 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), [{EthAddress: 'e2', Weight: 10}]);

    state.EthereumSyncStatus = 'out-of-sync';
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);

    state.EthereumSyncStatus = 'tx-pending';
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);

    state.EthereumSyncStatus = 'need-reset';
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);

    state.EthereumSyncStatus = 'operational';

    state.ManagementInCommittee = true;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), [{EthAddress: 'e2', Weight: 10}]);
});

test('too many successful daily tx', (t) => {
    const state = getExampleState();
    state.Reputations['o1'] = 10;
    state.Reputations['o2'] = 60; // bad
    state.Reputations['o3'] = 10;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
    t.assert(state.TimeEnteredBadReputation['e2'] > 1400000000);

    state.EthereumCommittedTxStats[getToday()] = exampleConfig.EthereumMaxCommittedDailyTx;
    state.TimeEnteredBadReputation['e2'] = getCurrentClockTime() - 10 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
});

test('is not in sync/stuck does not cause vote unready', (t) => {
    const state = getExampleState();
    state.Reputations['o1'] = 10;
    state.Reputations['o2'] = 70; // bad
    state.Reputations['o3'] = 10;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
    t.assert(state.TimeEnteredBadReputation['e2'] > 1400000000);

    state.TimeEnteredBadReputation['e2'] = getCurrentClockTime() - 10 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), [{EthAddress: 'e2', Weight: 10}]);

});

// Pins the production defaults that decide how long a peer must look out of sync before this writer
// votes it unready, so a resyncing reader (about 1.3h for a full v5 ethereum-reader resync) never
// triggers a vote. See "Vote unready timing" in the README for the arithmetic.
const defaults = {
    ...exampleConfig,
    RunLoopPollTimeSeconds: defaultConfiguration.RunLoopPollTimeSeconds,
    InvalidEthereumSyncSeconds: defaultConfiguration.InvalidEthereumSyncSeconds,
    ReputationSampleSize: defaultConfiguration.ReputationSampleSize,
    InvalidReputationThreshold: defaultConfiguration.InvalidReputationThreshold,
    InvalidReputationCheckThreshold: defaultConfiguration.InvalidReputationCheckThreshold,
    InvalidReputationGraceSeconds: defaultConfiguration.InvalidReputationGraceSeconds,
};

test('vote unready timing defaults are pinned', (t) => {
    t.is(defaultConfiguration.RunLoopPollTimeSeconds, 2 * 60); // one reputation sample per tick
    t.is(defaultConfiguration.InvalidEthereumSyncSeconds, 60 * 60); // a sample is bad when RefTime is 1h behind
    t.is(defaultConfiguration.ReputationSampleSize, 100); // last 100 samples (200 minutes)
    t.is(defaultConfiguration.InvalidReputationThreshold, 50); // bad when half of them are bad
    t.is(defaultConfiguration.InvalidReputationCheckThreshold, 20); // failsafe: median above 20% votes nobody
    t.is(defaultConfiguration.InvalidReputationGraceSeconds, 30 * 60 * 60); // then bad for 30h before a vote
});

test('with the defaults, a peer bad for less than 30 hours is not voted unready, after 30 hours it is', (t) => {
    const state = getExampleState();
    state.Reputations['o3'] = 100; // every sample bad

    state.TimeEnteredBadReputation['e3'] = getCurrentClockTime() - 29 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, defaults), []);

    state.TimeEnteredBadReputation['e3'] = getCurrentClockTime() - (30 * 60 * 60 + 60);
    t.deepEqual(getAllGuardiansToVoteUnready(state, defaults), [{EthAddress: 'e3', Weight: 10}]);
});

test('with the defaults, a peer that recovers restarts its 30 hour grace', (t) => {
    const state = getExampleState();
    state.Reputations['o3'] = 100;
    state.TimeEnteredBadReputation['e3'] = getCurrentClockTime() - 29 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, defaults), []);

    state.Reputations['o3'] = 49; // below the 50% threshold: good again
    t.deepEqual(getAllGuardiansToVoteUnready(state, defaults), []);
    t.is(state.TimeEnteredBadReputation['e3'], 0);

    state.Reputations['o3'] = 100; // bad again: the grace starts over
    t.deepEqual(getAllGuardiansToVoteUnready(state, defaults), []);
    t.true(getCurrentClockTime() - state.TimeEnteredBadReputation['e3'] < 5);
});

test('with the defaults, nobody is voted unready while the median peer is more than 20% bad', (t) => {
    const state = getExampleState();
    state.Reputations = {o1: 25, o2: 25, o3: 100, o4: 25, o5: 0}; // median 25%
    state.TimeEnteredBadReputation['e3'] = getCurrentClockTime() - 40 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, defaults), []);

    state.Reputations = {o1: 20, o2: 20, o3: 100, o4: 20, o5: 0}; // median 20%: not above the failsafe
    t.deepEqual(getAllGuardiansToVoteUnready(state, defaults), []); // re-entered bad just now
    state.TimeEnteredBadReputation['e3'] = getCurrentClockTime() - 40 * 60 * 60;
    t.deepEqual(getAllGuardiansToVoteUnready(state, defaults), [{EthAddress: 'e3', Weight: 10}]);
});
