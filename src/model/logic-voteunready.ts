import { State, CommitteeMember } from './state';
import { getToday } from '../helpers';


export function getAllGuardiansToVoteUnready(state: State, config: VoteUnreadyParams): CommitteeMember[] {
  if (state.EthereumCommittedTxStats[getToday()] >= config.EthereumMaxCommittedDailyTx) return [];
  if (state.EthereumSyncStatus != 'operational') return [];
  if (!state.ManagementInCommittee) return [];
  return state.ManagementCurrentCommittee.filter((guardian) => shouldBeVotedUnready(guardian, state, config));
}

function shouldBeVotedUnready(guardian: CommitteeMember, state: State, config: VoteUnreadyParams): boolean {
  if (!noPendingVoteUnready(guardian.EthAddress, state, config)) return false;
  return false;
}

// helpers

export interface VoteUnreadyParams {
  InvalidReputationGraceSeconds: number;
  VoteUnreadyValiditySeconds: number;
  EthereumMaxCommittedDailyTx: number;
}


function noPendingVoteUnready(ethAddress: string, state: State, config: VoteUnreadyParams): boolean {
  const nowEth = state.ManagementRefTime;
  const lastVoteUnready = state.EthereumLastVoteUnreadyTime[ethAddress] ?? 0;
  if (nowEth - lastVoteUnready > config.VoteUnreadyValiditySeconds) return true;
  const lastReadyForCommittee = state.ManagementOthersElectionsStatus[ethAddress]?.LastUpdateTime ?? 0;
  if (lastReadyForCommittee > lastVoteUnready) return true;
  return false;
}
