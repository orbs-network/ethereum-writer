import * as Logger from '../logger';
import {Reputations, State} from '../model/state';
import {getCurrentClockTime} from '../helpers';
import {fetchManagementStatus} from "./management";

const guardiansSyncResults: { [address: string]: boolean[] } = {};

/**
 * check sync of all guardians and updates state reputations
 *
 * @param config
 * @param state
 */
export async function readAllGuardiansReputations(config: ReputationConfigParams, state: State) {

    try {

        state.Reputations = await fetchGuardiansReputations(
            config,
            state
        );

    } catch (err) {

        Logger.error(err.stack);
        state.Reputations = {};

    }

    // last to be after all possible exceptions and processing delays
    state.ReputationsLastPollTime = getCurrentClockTime();

    // log progress
    Logger.log(`Fetched reputations.`);
}

// helpers

export interface ReputationConfigParams {
    ManagementServiceEndpointSchema: string;
    InvalidEthereumSyncSeconds: number;
    ReputationSampleSize: number;
}

/**
 *
 * @param config
 * @param state
 */
async function fetchGuardiansReputations(config: ReputationConfigParams, state: State): Promise<Reputations> {

    const guardiansReputation: { [address: string]: number } = {};

    await Promise.all(
        state.ManagementCurrentCommittee.map(
            guardian => (async () => {

                const _guardianSyncResults = guardiansSyncResults[guardian.EthAddress] = guardiansSyncResults[guardian.EthAddress] || []

                _guardianSyncResults.push(await isGuardianInSync(
                    guardian.EthAddress,
                    state,
                    config
                ))

                if (_guardianSyncResults.length >= config.ReputationSampleSize) {
                    _guardianSyncResults.shift() // keep latest sample size
                }

                guardiansReputation[guardian.EthAddress] = _guardianSyncResults.filter(rep => rep).length;

            })()
        )
    )

    return guardiansReputation

}


/**
 * check if guardian ethereum chain sync is valid
 *
 * @param ethAddress
 * @param state
 * @param config
 */
async function isGuardianInSync(ethAddress: string, state: State, config: ReputationConfigParams): Promise<boolean> {

    const guardian = state.ManagementCurrentTopology.find(guardian => guardian.EthAddress === ethAddress);

    const managementServiceEndpoint = config.ManagementServiceEndpointSchema.replace(/{{GUARDIAN_IP}}/g, guardian?.Ip + "");

    try {

        const response = await fetchManagementStatus(
            managementServiceEndpoint
        );

        return response.Payload.CurrentRefTime < config.InvalidEthereumSyncSeconds

    } catch (ignore) {

        Logger.log(`Cannot fetch response from guardian ${ethAddress}! bad reputation noted`);

        return false;

    }

}

