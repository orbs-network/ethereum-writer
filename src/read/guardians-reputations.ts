import * as Logger from '../logger';
import {Reputations, State} from '../model/state';
import {getCurrentClockTime} from '../helpers';
import {fetchManagementStatus, ManagementStatusResponse} from "./management";

const GUARDIAN_FALLBACK_PORT = "18888";

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

                const ethAddress = guardian.EthAddress;

                const orbsAddress = state.ManagementEthToOrbsAddress[ethAddress];

                const _guardianSyncResults = guardiansSyncResults[ethAddress] = guardiansSyncResults[ethAddress] || []

                _guardianSyncResults.push(await isGuardianInSync(
                    ethAddress,
                    state,
                    config
                ))

                if (_guardianSyncResults.length > config.ReputationSampleSize) {
                    _guardianSyncResults.shift() // keep latest sample size
                }

                guardiansReputation[orbsAddress] = _guardianSyncResults.filter(rep => !rep).length;

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

    const now = getCurrentClockTime();

    const response = await fetchMnmgnmtSrvStatusForGuardian(
        ethAddress,
        config,
        state
    );

    return response !== null && response.Payload && (now - response.Payload.CurrentRefTime) < config.InvalidEthereumSyncSeconds;

}


/**
 * attempt to fetch & parse management service status from guardian
 *
 * @param ethAddress
 * @param config
 * @param state
 */
async function fetchMnmgnmtSrvStatusForGuardian(ethAddress: string, config: ReputationConfigParams, state: State): Promise<ManagementStatusResponse | null> {

    let response = null;

    const guardian = state.ManagementCurrentTopology.find(guardian => guardian.EthAddress === ethAddress);

    let managementServiceEndpoint = config.ManagementServiceEndpointSchema.replace(/{{GUARDIAN_IP}}/g, guardian?.Ip + "");

    try {

        response = await fetchManagementStatus(
            managementServiceEndpoint
        );

    } catch (ignore) {

        try {

            Logger.log(`Cannot fetch management service status from guardian [${ethAddress}] on port [80], attempting to fetch over fallback port [${GUARDIAN_FALLBACK_PORT}]`);

            managementServiceEndpoint = config.ManagementServiceEndpointSchema.replace(/{{GUARDIAN_IP}}/g, guardian?.Ip + ":" + GUARDIAN_FALLBACK_PORT);

            response = await fetchManagementStatus(
                managementServiceEndpoint
            );

        } catch (ignore) {

            Logger.log(`Failed to fetch management service status from guardian [${ethAddress}], reporting bad reputation!`);

        }

    }

    return response;

}
