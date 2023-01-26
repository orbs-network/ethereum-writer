import * as Logger from '../logger';
import {Reputations, State} from '../model/state';
import {getCurrentClockTime} from '../helpers';
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

        Logger.log(`** DONE fetchGuardiansReputations`)


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

                const ethAddress = guardian.EthAddress;

                const orbsAddress = state.ManagementEthToOrbsAddress[ethAddress];

                /*const _guardianSyncResults = guardiansSyncResults[ethAddress] = guardiansSyncResults[ethAddress] || []

                _guardianSyncResults.push(await isGuardianInSync(
                    ethAddress,
                    state,
                    config
                ))
                Logger.log(`** DONE isGuardianInSync`)

                if (_guardianSyncResults.length > config.ReputationSampleSize) {
                    _guardianSyncResults.shift() // keep latest sample size
                }*/

                // guardiansReputation[orbsAddress] = _guardianSyncResults.filter(rep => !rep).length;
                guardiansReputation[orbsAddress] = 0;
                config.ManagementServiceEndpointSchema;
                await new Promise((resolve) => setTimeout(resolve, 1000));

            })()
        )
    )

    return guardiansReputation

}

