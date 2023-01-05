import test from 'ava';
import {State} from '../model/state';
import {readAllGuardiansReputations} from './guardians-reputations';
import {exampleConfig} from '../config.example';
import {getCurrentClockTime, jsonStringifyComplexTypes} from '../helpers';

function getExampleState() {
    return new State();
}

test('reads data from valid Reputations', async (t) => {
    const state = getExampleState();
    await readAllGuardiansReputations(exampleConfig, state);

    t.log('state:', jsonStringifyComplexTypes(state));

    t.assert(getCurrentClockTime() - state.ReputationsLastPollTime < 5);

});

test('invalid Reputations response', async (t) => {
    const state = getExampleState();

    await readAllGuardiansReputations(exampleConfig, state);

    t.log('state:', jsonStringifyComplexTypes(state));

    t.assert(getCurrentClockTime() - state.ReputationsLastPollTime < 5);
    t.is(state.Reputations['010203'], 17);


});
