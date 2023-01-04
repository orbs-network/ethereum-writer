import test from 'ava';
import {State} from '../model/state';
import {readAllGuardiansReputations} from './guardians-reputations';
import {exampleConfig} from '../config.example';
import {getCurrentClockTime, jsonStringifyComplexTypes} from '../helpers';

function getExampleState() {
    const exampleState = new State();
    exampleState.ManagementVirtualChains['1000000'] = {
        Expiration: 1592400011,
        GenesisRefTime: 1592400010,
        IdentityType: 0,
        RolloutGroup: 'main',
        Tier: 'defaultTier',
    };
    exampleState.ManagementVirtualChains['1000001'] = {
        Expiration: 1592400021,
        GenesisRefTime: 1592400020,
        IdentityType: 0,
        RolloutGroup: 'canary',
        Tier: 'defaultTier',
    };
    return exampleState;
}

test('gets Orbs client', (t) => {
    const state = getExampleState();
    t.assert(state.orbsClientPerVchain['1000000']);
});

test('reads data from valid VchainReputations', async (t) => {
    const state = getExampleState();
    await readAllGuardiansReputations(exampleConfig, state);

    t.log('state:', jsonStringifyComplexTypes(state));

    t.assert(getCurrentClockTime() - state.ReputationsLastPollTime < 5);
    t.is(state.Reputations['010203'], 17);

});

test('invalid VchainReputations response from first vchain', async (t) => {
    const state = getExampleState();

    await readAllGuardiansReputations(exampleConfig, state);

    t.log('state:', jsonStringifyComplexTypes(state));

    t.assert(getCurrentClockTime() - state.ReputationsLastPollTime < 5);
    t.is(state.Reputations['010203'], 17);
    t.deepEqual(state.Reputations, {});
});
