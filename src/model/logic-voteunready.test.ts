import test from 'ava';
import {State} from './state';
import {getAllGuardiansToVoteUnready} from './logic-voteunready';
import {exampleConfig} from '../config.example';
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
