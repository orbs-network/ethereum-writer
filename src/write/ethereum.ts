import {
  Type,
  EthereumTxParams,
  getGasPriceStrategy,
  calcGasPrice,
  signAndSendTransaction,
  handlePendingTxTimeout,
  getReceiptFeeInEth,
  SignerError,
  SpendingLimitError,
  ChainCheckError,
  chainMismatchReason,
} from './ethereum-helpers';
import Web3 from 'web3';
import { recordProviderErrors } from './rpc-errors';
import * as Logger from '../logger';
import { describeError, describeErrorStack } from '../redact';
import { getCurrentClockTime, getToday, getTenDayPeriod } from '../helpers';
import { State, EthereumTxStatus, CommitteeMember } from '../model/state';
import {
  ContractRegistryKey,  
  getAbiByContractAddress,
  getAbiByContractRegistryKey,
} from '@orbs-network/orbs-ethereum-contracts-v2';

const HTTP_TIMEOUT_SEC = 20;

// no network access: safe to call before the RPC is reachable (see readChainId)
export function initWeb3Client(ethereumEndpoint: string, electionsContractAddress: string, state: State) {
  // init web3
  const provider = new Web3.providers.HttpProvider(ethereumEndpoint, {
    keepAlive: true,
    timeout: HTTP_TIMEOUT_SEC * 1000,
  });
  recordProviderErrors(provider, state.RpcErrors);
  state.web3 = new Web3(provider);
  state.web3.eth.transactionBlockTimeout = 0; // to stop web3 from polling pending tx
  state.web3.eth.transactionPollingTimeout = 0; // to stop web3 from polling pending tx
  state.web3.eth.transactionConfirmationBlocks = 1; // to stop web3 from polling pending tx

  // init contracts
  const electionsAbi = getAbiForContract(electionsContractAddress, 'elections');
  state.ethereumElectionsContract = new state.web3.eth.Contract(electionsAbi, electionsContractAddress);  
}

/**
 * Checks that the RPC is on the expected chain before anything is signed: its chain id must equal
 * config.EthereumChainId, and (once per verified chain) the Elections contract must have code there.
 * On a mismatch state.chainId is cleared, so nothing can be signed, and state.ChainCheckError says why.
 * Throws only when the RPC fails or answers nonsense.
 */
export async function verifyChain(state: State, expectedChainId: number, electionsContractAddress: string): Promise<boolean> {
  if (!state.web3) throw new Error('Cannot verify the chain until web3 client is initialized.');
  const chainId = Number(await state.web3.eth.getChainId());
  if (!Number.isInteger(chainId) || chainId <= 0) throw new Error(`RPC returned an invalid chain id: ${chainId}.`);
  if (chainId !== expectedChainId) return chainCheckFailed(state, chainMismatchReason(chainId, expectedChainId));

  if (!state.ElectionsCodeVerified) {
    const code = await state.web3.eth.getCode(electionsContractAddress);
    if (!code || /^0x0*$/i.test(code)) {
      return chainCheckFailed(state, `no contract code at the Elections address ${electionsContractAddress} on this RPC`);
    }
    state.ElectionsCodeVerified = true;
  }

  if (state.chainId !== chainId) Logger.log(`Ethereum chain id ${chainId} verified, Elections contract found.`);
  state.chainId = chainId;
  state.ChainCheckError = '';
  return true;
}

function chainCheckFailed(state: State, reason: string): false {
  if (state.ChainCheckError !== reason) Logger.error(`Not signing anything: ${reason}.`);
  state.chainId = 0;
  state.ElectionsCodeVerified = false;
  state.ChainCheckError = reason;
  return false;
}

/**
 * Records a send attempt that did not send. A spending-limit refusal restores the previous tx status:
 * it is a decision not to send, and must not look like a failed send (which would switch the next
 * attempt to the non-discount gas price). Anything else, a signer failure included, is a failed send.
 */
function handleSendFailure(
  err: Error,
  description: string,
  previous: EthereumTxStatus | undefined,
  current: EthereumTxStatus,
  state: State
): EthereumTxStatus | undefined {
  if (err instanceof SpendingLimitError) {
    state.SpendingLimitReason = err.message;
    Logger.error(`Not sending ${description}: ${err.message}.`);
    return previous;
  }
  if (err instanceof ChainCheckError) {
    // nothing was signed: block signing until the next tick verifies the chain again
    state.ChainCheckError = err.message;
    state.chainId = 0;
    state.ElectionsCodeVerified = false;
    Logger.error(`Not sending ${description}: ${err.message}.`);
    return previous;
  }
  if (err instanceof SignerError) {
    state.SignerError = { Time: getCurrentClockTime(), Message: err.message };
  }
  Logger.error(`Failed sending ${description}: ${describeErrorStack(err)}`);
  current.Status = 'failed-send';
  current.Error = describeError(err, 200);
  return current;
}

function getAbiForContract(address: string, contractName: ContractRegistryKey) {
  // attempts to get the ABI by address first (useful for deprecated contracts and breaking ABI changes)
  const abi = getAbiByContractAddress(address);
  if (abi) return abi;

  // if address is unknown, rely on the latest ABI's (useful for testing mostly)
  return getAbiByContractRegistryKey(contractName);
}

export async function sendEthereumElectionsTransaction(
  type: Type,
  nodeOrbsAddress: string,
  state: State,
  config: EthereumTxParams
) {
  if (!state.ethereumElectionsContract) throw new Error('Cannot send tx until contract object is initialized.');

  const contractMethod =
    type == 'ready-to-sync'
      ? state.ethereumElectionsContract.methods.readyToSync
      : state.ethereumElectionsContract.methods.readyForCommittee;
  const gasPriceStrategy = getGasPriceStrategy(state.EthereumLastElectionsTx);
  const gasPrice = await calcGasPrice(gasPriceStrategy, state, config);

  const previous = state.EthereumLastElectionsTx;
  state.EthereumLastElectionsTx = {
    LastPollTime: 0,
    Type: type,
    SendTime: getCurrentClockTime(),
    GasPriceStrategy: gasPriceStrategy,
    GasPrice: gasPrice,
    Status: 'pending',
    TxHash: '',
    EthBlock: 0,
  };

  try {
    const encodedAbi = contractMethod().encodeABI() as string;
    const contractAddress = state.ethereumElectionsContract.options.address;
    const senderAddress = `0x${nodeOrbsAddress}`;
    const txHash = await signAndSendTransaction(encodedAbi, contractAddress, senderAddress, gasPrice, state, config);
    state.EthereumLastElectionsTx.TxHash = txHash;
    Logger.log(`${type} transaction sent with txHash ${txHash}.`);
  } catch (err) {
    state.EthereumLastElectionsTx = handleSendFailure(err, `${type} transaction`, previous, state.EthereumLastElectionsTx, state);
  }
}

export async function sendEthereumVoteUnreadyTransaction(
  to: CommitteeMember[],
  nodeOrbsAddress: string,
  state: State,
  config: EthereumTxParams
) {
  if (!state.ethereumElectionsContract) throw new Error('Cannot send tx until contract object is initialized.');

  if (to.length == 0) return;
  const ethAddress = to[0].EthAddress;
  const ethAddressForAbi = `0x${ethAddress}`;
  const contractMethod = state.ethereumElectionsContract.methods.voteUnready;
  const gasPriceStrategy = getGasPriceStrategy(state.EthereumLastVoteUnreadyTx);
  const gasPrice = await calcGasPrice(gasPriceStrategy, state, config);

  const previous = state.EthereumLastVoteUnreadyTx;
  state.EthereumLastVoteUnreadyTx = {
    LastPollTime: 0,
    Type: 'vote-unready',
    SendTime: getCurrentClockTime(),
    GasPriceStrategy: gasPriceStrategy,
    GasPrice: gasPrice,
    Status: 'pending',
    TxHash: '',
    EthBlock: 0,
    Target: ethAddress,
    OnFinal: voteUnreadyOnFinal(ethAddress, state),
  };

  // special mode to simulate vote unready without actually sending the transactions
  if (config.SuspendVoteUnready) {
    state.EthereumLastVoteUnreadyTx.Status = 'final';
    if (state.EthereumLastVoteUnreadyTx.OnFinal) state.EthereumLastVoteUnreadyTx.OnFinal();
    state.EthereumLastVoteUnreadyTx.TxHash = 'not-actually-sent';
    Logger.log(`vote unready transaction against ${ethAddress} simulated and not actually sent.`);
    return; // and don't actually send the tx
  }

  try {
    const voteExpiration = getCurrentClockTime() + config.VoteUnreadyValiditySeconds;
    const encodedAbi = contractMethod(ethAddressForAbi, voteExpiration).encodeABI() as string;
    const contractAddress = state.ethereumElectionsContract.options.address;
    const senderAddress = `0x${nodeOrbsAddress}`;
    const txHash = await signAndSendTransaction(encodedAbi, contractAddress, senderAddress, gasPrice, state, config);
    state.EthereumLastVoteUnreadyTx.TxHash = txHash;
    Logger.log(`vote unready transaction against ${ethAddress} sent with txHash ${txHash}.`);
  } catch (err) {
    state.EthereumLastVoteUnreadyTx = handleSendFailure(err, `vote unready transaction against ${ethAddress}`, previous, state.EthereumLastVoteUnreadyTx, state);
  }
}

export function voteUnreadyOnFinal(ethAddress: string, state: State) {
  return () => {
    state.EthereumLastVoteUnreadyTime[ethAddress] = state.ManagementRefTime;
  };
}

export async function readPendingTransactionStatus(
  status: EthereumTxStatus | undefined,
  state: State,
  config: EthereumTxParams
) {
  if (!state.web3) throw new Error('Cannot check pending tx status until web3 client is initialized.');
  if (!status) return;
  if (status.Status != 'pending') return;
  if (!status.TxHash) return;

  // no need to poll ethereum if we know the block, just wait until management service reaches it
  if (status.EthBlock > 0) {
    if (state.ManagementEthRefBlock >= status.EthBlock) {
      Logger.log(`Last ethereum ${status.Type} tx ${status.TxHash} is final.`);
      status.Status = 'final';
      if (status.OnFinal) status.OnFinal();
    }
    return;
  }

  // done before the actual execution to space out calls in case of connection errors
  status.LastPollTime = getCurrentClockTime();

  // needed since getTransactionReceipt fails on light client when tx is pending
  const tx = await state.web3.eth.getTransaction(status.TxHash);
  if (tx == null || tx.blockNumber == null) {
    Logger.log(`Last ethereum ${status.Type} tx ${status.TxHash} is still waiting for block.`);
    handlePendingTxTimeout(status, state, config);
    return; // still pending
  }
  const receipt = await state.web3.eth.getTransactionReceipt(status.TxHash);
  if (receipt == null) {
    Logger.log(`Last ethereum ${status.Type} tx ${status.TxHash} does not have receipt yet.`);
    handlePendingTxTimeout(status, state, config);
    return; // still pending
  }

  // transaction is committed
  status.EthBlock = receipt.blockNumber;
  state.EthereumConsecutiveTxTimeouts = 0;
  const today = getToday();
  if (!state.EthereumCommittedTxStats[today]) state.EthereumCommittedTxStats[today] = 0;
  state.EthereumCommittedTxStats[today]++;
  const tenDays = getTenDayPeriod();
  if (!state.EthereumFeesStats[tenDays]) state.EthereumFeesStats[tenDays] = 0;
  state.EthereumFeesStats[tenDays] += getReceiptFeeInEth(receipt, status);
  if (receipt.status) {
    Logger.log(`Last ethereum ${status.Type} tx ${status.TxHash} was successful in block ${receipt.blockNumber}.`);
    if (state.ManagementEthRefBlock >= receipt.blockNumber) {
      Logger.log(`Last ethereum ${status.Type} tx ${status.TxHash} is final.`);
      status.Status = 'final';
      if (status.OnFinal) status.OnFinal();
    }
  } else {
    Logger.error(`Last ethereum ${status.Type} tx ${status.TxHash} was reverted in block ${receipt.blockNumber}.`);
    status.Status = 'revert';
  }
}

export async function readEtherBalance(nodeOrbsAddress: string, state: State) {
  if (!state.web3) throw new Error('Cannot check ETH balance until web3 client is initialized.');

  // done before the actual execution to space out calls in case of connection errors
  state.EthereumBalanceLastPollTime = getCurrentClockTime();

  state.EtherBalance = await state.web3.eth.getBalance(nodeOrbsAddress);

  // log progress
  Logger.log(`Fetched ETH balance for account ${nodeOrbsAddress}: ${state.EtherBalance}.`);
}

export async function queryCanJoinCommittee(nodeOrbsAddress: string, state: State): Promise<boolean> {
  if (!state.ethereumElectionsContract)
    throw new Error('Cannot query canJoinCommittee until contract object is initialized.');

  // done before the actual execution to space out calls in case of connection errors
  state.EthereumCanJoinCommitteeLastPollTime = getCurrentClockTime();

  const orbsAddressForAbi = `0x${nodeOrbsAddress}`;
  const contractMethod = state.ethereumElectionsContract.methods.canJoinCommittee;
  const res = await contractMethod(orbsAddressForAbi).call();

  // log progress
  Logger.log(`Queried canJoinCommittee for account ${nodeOrbsAddress}: ${res}.`);

  return res;
}