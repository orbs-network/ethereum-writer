import { AbiItem } from 'web3-utils';
import electionsAbiJson from './elections.abi.json';
import guardiansRegistrationAbiJson from './guardians-registration.abi.json';

// The only two contract ABIs the writer uses, copied unchanged from
// @orbs-network/orbs-ethereum-contracts-v2@0.0.38 (abi/Elections.abi.json and
// abi/GuardiansRegistration.abi.json), which the writer used to load at runtime. That package also put
// ganache-core and truffle-hdwallet-provider into the production image. The same ABIs serve the
// Ethereum and Polygon deployments.
export const electionsAbi = electionsAbiJson as AbiItem[];
export const guardiansRegistrationAbi = guardiansRegistrationAbiJson as AbiItem[];
