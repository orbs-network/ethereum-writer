import test from 'ava';
import {State} from '../model/state';
import {readAllGuardiansReputations} from './guardians-reputations';
import {exampleConfig} from '../config.example';
import {getCurrentClockTime, jsonStringifyComplexTypes} from '../helpers';
import nock from "nock";
import mgntStatusMock from './management-service-status-mock';
import mgntStatusMockOld from './management-service-status-mock';

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
    exampleState.ManagementCurrentTopology = [
        {EthAddress: 'e1', Ip: 'management-service-404'},
        {EthAddress: 'e2', Ip: 'management-service-old'},
        {EthAddress: 'e3', Ip: 'management-service-good'},
        {EthAddress: 'e4', Ip: 'management-service-good'},
        {EthAddress: 'e5', Ip: 'management-service-good'}
    ];
    exampleState.ManagementEthToOrbsAddress = {e1: 'o1', e2: 'o2', e3: 'o3', e4: 'o4', e5: 'o5'};
    exampleState.Reputations = {o1: 0, o2: 0, o3: 0, o4: 0, o5: 0};

    mgntStatusMock.Payload.CurrentRefTime = (Date.now() / 1000);
    nock('http://management-service-good').get('/services/management-service/status').reply(200, mgntStatusMock).persist();


    mgntStatusMockOld.Payload.CurrentRefTime = Math.round((Date.now() - (1000 * 60 * 60 * 60)) / 1000);
    nock('http://management-service-old').get('/services/management-service/status').reply(200, mgntStatusMockOld).persist();

    nock('http://management-service-404').get('/services/management-service/status').reply(404).persist();

    return exampleState;

}

test('reads data from valid Reputations', async (t) => {
    const state = getExampleState();
    await readAllGuardiansReputations(exampleConfig, state);

    t.log('state:', jsonStringifyComplexTypes(state));

    t.assert(getCurrentClockTime() - state.ReputationsLastPollTime < 5);

});

test('invalid Reputations response', async (t) => {
    const state = getExampleState();

    // 'http://{{GUARDIAN_IP}}/services/management-service/status'

    await readAllGuardiansReputations(exampleConfig, state);

    t.log('state:', jsonStringifyComplexTypes(state));

    t.assert(getCurrentClockTime() - state.ReputationsLastPollTime < 5);

    t.is(state.Reputations['o1'], 2);
    t.is(state.Reputations['o2'], 2);

    t.is(state.Reputations['o3'], 0);
    t.is(state.Reputations['o4'], 0);
    t.is(state.Reputations['o5'], 0);

});
