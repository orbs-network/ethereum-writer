import {CommitteeMember, Reputations, State} from './state';
import {getCurrentClockTime, getToday} from '../helpers';
import * as Logger from "../logger";
import {calcMedianInPlace} from "./helpers";

/**
 * returns a list of all guardians that need to be voted unready
 *
 * @param state
 * @param config
 */
export function getAllGuardiansToVoteUnready(state: State, config: VoteUnreadyParams): CommitteeMember[] {

    if (state.EthereumCommittedTxStats[getToday()] >= config.EthereumMaxCommittedDailyTx) return [];
    if (state.EthereumSyncStatus != 'operational') return [];
    if (!state.ManagementInCommittee) return [];
    return state.ManagementCurrentCommittee.filter((guardian) => shouldBeVotedUnready(guardian, state, config));

}

/**
 * should a guardian be voted unready according to its bad reputation or already "vote unready" state
 *
 * @param guardian
 * @param state
 * @param config
 */
function shouldBeVotedUnready(guardian: CommitteeMember, state: State, config: VoteUnreadyParams): boolean {

    if (!noPendingVoteUnready(guardian.EthAddress, state, config)) return false;
    if (hasLongBadReputation(guardian.EthAddress, state, config)) return true;
    return false;

}

// helpers

export interface VoteUnreadyParams {
    InvalidReputationGraceSeconds: number;
    VoteUnreadyValiditySeconds: number;
    EthereumMaxCommittedDailyTx: number;
    ReputationSampleSize: number;
    InvalidReputationCheckThreshold: number;
    InvalidReputationThreshold: number;
}

/**
 * guardian has bad reputation for above InvalidReputationGraceSeconds
 *
 * @param ethAddress
 * @param state
 * @param config
 */
function hasLongBadReputation(ethAddress: string, state: State, config: VoteUnreadyParams): boolean {

    const now = getCurrentClockTime();

    const orbsAddress = state.ManagementEthToOrbsAddress[ethAddress];

    if (!orbsAddress) return false;

    initTimeEnteredBadReputationIfNeeded(ethAddress, state);

    // maintain a helper state variable to see how long they're in bad reputation
    if (isBadReputation(orbsAddress, state.Reputations, config)) {

        if (state.TimeEnteredBadReputation[ethAddress] == 0) state.TimeEnteredBadReputation[ethAddress] = now;

    } else state.TimeEnteredBadReputation[ethAddress] = 0;

    if (state.TimeEnteredBadReputation[ethAddress] == 0) return false;

    if (now - state.TimeEnteredBadReputation[ethAddress] > config.InvalidReputationGraceSeconds) {

        Logger.log(`Found orbs address ${orbsAddress} with bad reputation for a long time!`);
        return true;

    }

    return false;
}

/**
 * check if guardian has bad reputation above threshold compared to all other guardians
 *
 * @param orbsAddress
 * @param reputations
 * @param config
 */
function isBadReputation(orbsAddress: string, reputations: Reputations, config: VoteUnreadyParams): boolean {

    const value = reputations[orbsAddress] ?? -1;

    if (value < 0) return false;

    // check if the specific guardian has a high percentage of bad reputation reports
    if (calcPercentage(value, config) < config.InvalidReputationThreshold) return false;

    // this is a failsafe for when the entire network accidentally is out of sync. check if median bad reputation amount is above threshold
    if (calcPercentage(calcMedianInPlace(Object.values(reputations)), config) > config.InvalidReputationCheckThreshold) return false;

    return true;

}

/**
 * calculate percentage of bad reputation value of the sample size
 *
 * @param badReputationAmount
 * @param config
 */
function calcPercentage(badReputationAmount: number, config: VoteUnreadyParams) {

    return (badReputationAmount / config.ReputationSampleSize) * 100

}

/**
 * check if there's a valid "vote unready" already
 *
 * @param ethAddress
 * @param state
 * @param config
 */
function noPendingVoteUnready(ethAddress: string, state: State, config: VoteUnreadyParams): boolean {

    const nowEth = state.ManagementRefTime;
    const lastVoteUnready = state.EthereumLastVoteUnreadyTime[ethAddress] ?? 0;
    if (nowEth - lastVoteUnready > config.VoteUnreadyValiditySeconds) return true;
    const lastReadyForCommittee = state.ManagementOthersElectionsStatus[ethAddress]?.LastUpdateTime ?? 0;
    if (lastReadyForCommittee > lastVoteUnready) return true;
    return false;

}

/**
 * if undefined, sets bad reputation time to 0
 *
 * @param ethAddress
 * @param state
 */
function initTimeEnteredBadReputationIfNeeded(ethAddress: string, state: State) {

    if (!state.TimeEnteredBadReputation[ethAddress]) state.TimeEnteredBadReputation[ethAddress] = 0;

}
