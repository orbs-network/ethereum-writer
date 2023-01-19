import _ from 'lodash';
import * as Logger from '../logger';
import { State } from '../model/state';
import fetch from 'node-fetch';
import { Decoder, decodeString, num, object, record, bool, str, array, maybe } from 'ts-json-decode';
import { getCurrentClockTime } from '../helpers';
import { findEthFromOrbsAddress } from '../model/helpers';
import { getAbiByContractRegistryKey } from '@orbs-network/orbs-ethereum-contracts-v2';

// update guardianRegistration contract instance and address
export function updateGuardianRegistrationContract(state: State, address:string){
  Logger.log(`updateGuardianRegistrationContract: ${address} `);

  if(!address) {
    Logger.error('guardianRegistrationAddress is not valid')
    return 
  }
  // addigment
  state.guardianRegistrationAddress = address;
  
  const regAbi = getAbiByContractRegistryKey('guardiansRegistration');
  if(!regAbi) {
    Logger.error(`failed to create regApi`);
    return;
  }
  if(!state.web3){
    Logger.error(`web3 is not initialized`);
    return;
  }
  
  state.guardianRegistration = new state.web3.eth.Contract(regAbi, state.guardianRegistrationAddress);
  if(!state.guardianRegistration) 
    Logger.error(`failed to create state.guardianRegistration web3 instance`);
}
export async function readManagementStatus(endpoint: string, myOrbsAddress: string, state: State) {
  const url = `${endpoint}/status`;
  const response = await fetchManagementStatus(url);

  state.ManagementRefTime = response.Payload.CurrentRefTime;
  state.ManagementEthRefBlock = response.Payload.CurrentRefBlock;

  state.ManagementCurrentCommittee = response.Payload.CurrentCommittee;
  state.ManagementCurrentStandbys = _.filter(response.Payload.CurrentCandidates, (node) => node.IsStandby);
  state.ManagementCurrentTopology = response.Payload.CurrentTopology;
  state.ManagementEthToOrbsAddress = _.mapValues(response.Payload.Guardians, (node) => node.OrbsAddress);

  if(state.guardianRegistrationAddress !== response.Payload.CurrentContractAddress.guardiansRegistration){    
    updateGuardianRegistrationContract(state, response.Payload.CurrentContractAddress.guardiansRegistration);
  }
  
  if(!state.myEthGuardianAddress)
    state.myEthGuardianAddress = findEthFromOrbsAddress(myOrbsAddress, state);

  state.ManagementInCommittee = response.Payload.CurrentCommittee.some((node) => node.EthAddress == state.myEthGuardianAddress);
  state.ManagementIsStandby = state.ManagementCurrentStandbys.some((node) => node.EthAddress == state.myEthGuardianAddress);
  state.ManagementMyElectionsStatus = response.Payload.Guardians[state.myEthGuardianAddress]?.ElectionsStatus;
  state.ManagementOthersElectionsStatus = _.mapValues(response.Payload.Guardians, (node) => node.ElectionsStatus);
  delete state.ManagementOthersElectionsStatus[state.myEthGuardianAddress];

  // last to be after all possible exceptions and processing delays
  state.ManagementLastPollTime = getCurrentClockTime();

  // log progress
  Logger.log(`Fetched management service.`);
}

// helpers

export async function fetchManagementStatus(url: string): Promise<ManagementStatusResponse> {
  const res = await fetch(url);
  const body = await res.text();
  try {
    return decodeString(managementStatusResponseDecoder, body);
  } catch (err) {
    Logger.error(err.message);
    throw new Error(`Invalid ManagementStatus response (HTTP-${res.status}):\n${body}`);
  }
}

export interface ManagementStatusResponse {
  Payload: {
    CurrentRefTime: number;
    CurrentRefBlock: number;
    CurrentCommittee: { EthAddress: string; Weight: number }[];
    CurrentCandidates: { EthAddress: string; IsStandby: boolean }[];
    CurrentTopology: { EthAddress: string , Ip: string }[];
    CurrentContractAddress:{guardiansRegistration:string};
    Guardians: {
      [EthAddress: string]: {
        OrbsAddress: string;
        ElectionsStatus?: {
          LastUpdateTime: number;
          ReadyToSync: boolean;
          ReadyForCommittee: boolean;
          TimeToStale: number;
        };
      };
    };
  };
}

const managementStatusResponseDecoder: Decoder<ManagementStatusResponse> = object({
  Payload: object({
    CurrentRefTime: num,
    CurrentRefBlock: num,
    CurrentCommittee: array(
      object({
        EthAddress: str,
        Weight: num,
      })
    ),
    CurrentCandidates: array(
      object({
        EthAddress: str,
        IsStandby: bool,
      })
    ),
    CurrentTopology: array(
      object({
        EthAddress: str,
        Ip: str,
      })
    ),
    CurrentContractAddress: object({
      guardiansRegistration: str,
    }),
    
    Guardians: record(
      object({
        OrbsAddress: str,
        ElectionsStatus: maybe(
          object({
            LastUpdateTime: num,
            ReadyToSync: bool,
            ReadyForCommittee: bool,
            TimeToStale: num,
          })
        ),
      })
    ),
  }),
});

export async function isGuardianRegistered(state: State): Promise<boolean> {
  if (!state.myEthGuardianAddress) return false; // if myEthGuardianAddress is empty it means the node is not registered (not present in matic reader)
  return await state.guardianRegistration?.methods.isRegistered(state.myEthGuardianAddress).call();  
}
