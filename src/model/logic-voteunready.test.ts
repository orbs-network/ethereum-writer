import test from 'ava';
import { State } from './state';
import { getAllGuardiansToVoteUnready } from './logic-voteunready';
import { exampleConfig } from '../config.example';
import { getCurrentClockTime } from '../helpers';

// example state reflects excellent reputations
function getExampleState() {
  const exampleState = new State();
  exampleState.EthereumSyncStatus = 'operational';
  exampleState.ManagementRefTime = getCurrentClockTime() - 10;
  exampleState.ManagementInCommittee = true;
  exampleState.ManagementCurrentCommittee = [
    { EthAddress: 'e1', Weight: 10 },
    { EthAddress: 'e2', Weight: 10 },
    { EthAddress: 'e3', Weight: 10 },
  ];
  exampleState.ManagementEthToOrbsAddress = { e1: 'o1', e2: 'o2', e3: 'o3' };
  return exampleState;
}

test('guardian which is not in committee is not voted unready', (t) => {
  const state = getExampleState();
  t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);

  t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), [{ EthAddress: 'e2', Weight: 10 }]);

  state.ManagementCurrentCommittee = [
    { EthAddress: 'e1', Weight: 10 },
    { EthAddress: 'e7', Weight: 10 },
    { EthAddress: 'e3', Weight: 10 },
  ];
  t.deepEqual(getAllGuardiansToVoteUnready(state, exampleConfig), []);
});
