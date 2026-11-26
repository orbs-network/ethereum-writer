import test from 'ava';
import {
  initWeb3Client,
  verifyChain,
  sendEthereumElectionsTransaction,
  sendEthereumVoteUnreadyTransaction,
  readPendingTransactionStatus,
  queryCanJoinCommittee,  
} from './ethereum';
import Web3 from 'web3';
import { State, EthereumTxStatus } from '../model/state';
import { Contract } from 'web3-eth-contract';
import { sleep, getCurrentClockTime, getToday, getTenDayPeriod } from '../helpers';
import Signer from 'orbs-signer-client';
import { exampleConfig } from '../config.example';
import { TransactionReceipt } from 'web3-core';
import { getReceiptFeeInEth, dailyLimitReachedReason } from './ethereum-helpers';
import nock from 'nock';


test('initializes web3 and contracts, and verifies the chain against a real RPC answer', async (t) => {
  const state = new State();

  nock(/ganache/)
    .post(/.*/, /eth_chainId/)
    .reply(200, JSON.stringify({"jsonrpc":"2.0","id":1,"result":"0x1"}))
    .post(/.*/, /eth_getCode/)
    .reply(200, JSON.stringify({"jsonrpc":"2.0","id":2,"result":"0x6080604052"}));

  initWeb3Client('http://ganache:7545/', '0xf8B352100dE45D2668768290504DC89e85766E02', state);
  t.assert(state.web3);
  t.assert(state.ethereumElectionsContract);
  t.is(state.chainId, 0); // nothing is read until verifyChain
  t.true(await verifyChain(state, 1, '0xf8B352100dE45D2668768290504DC89e85766E02'));
  t.is(state.chainId, 1);
});

// a web3 stand-in for the chain check: a settable chain id and Elections code, counting getCode calls
function chainRpc(chainId: number, code = '0x6080604052') {
  const rpc = {
    chainId,
    code,
    getCodeCalls: 0,
    eth: {
      getChainId: async () => {
        await sleep(0);
        return rpc.chainId;
      },
      getCode: async () => {
        await sleep(0);
        rpc.getCodeCalls++;
        return rpc.code;
      },
    },
  };
  return rpc;
}

test('verifyChain passes on the expected chain and checks the Elections code only once', async (t) => {
  const state = new State();
  const rpc = chainRpc(1);
  state.web3 = (rpc as unknown) as Web3;
  t.true(await verifyChain(state, 1, '0xelections'));
  t.true(await verifyChain(state, 1, '0xelections'));
  t.is(state.chainId, 1);
  t.is(state.ChainCheckError, '');
  t.is(rpc.getCodeCalls, 1);
});

test('verifyChain blocks signing on another chain, and recovers when the RPC is fixed', async (t) => {
  const state = new State();
  const rpc = chainRpc(1);
  state.web3 = (rpc as unknown) as Web3;
  t.true(await verifyChain(state, 1, '0xelections'));

  rpc.chainId = 11155111; // the endpoint now serves Sepolia
  t.false(await verifyChain(state, 1, '0xelections'));
  t.is(state.chainId, 0);
  t.is(state.ChainCheckError, 'chain id mismatch: RPC reports 11155111, expected 1');

  rpc.chainId = 1;
  t.true(await verifyChain(state, 1, '0xelections'));
  t.is(state.chainId, 1);
  t.is(state.ChainCheckError, '');
  t.is(rpc.getCodeCalls, 2); // checked again after the mismatch
});

test('verifyChain blocks signing when the Elections contract has no code on this RPC', async (t) => {
  const state = new State();
  state.web3 = (chainRpc(1, '0x') as unknown) as Web3;
  t.false(await verifyChain(state, 1, '0xelections'));
  t.is(state.chainId, 0);
  t.is(state.ChainCheckError, 'no contract code at the Elections address 0xelections on this RPC');
});

test('verifyChain throws on a nonsense chain id', async (t) => {
  const state = new State();
  state.web3 = (chainRpc(0) as unknown) as Web3;
  await t.throwsAsync(() => verifyChain(state, 1, '0xelections'), { message: /invalid chain id/ });
});

// a state that already read its chain id from the RPC
function newState() {
  const state = new State();
  state.chainId = 1;
  return state;
}

function getMockWeb3Client(behavior: 'success' | 'badsend' | 'pending' | 'revert' | 'removed' | 'overmax' | 'otherchain' = 'success') {
  return ({
    eth: {
      getChainId: async () => {
        await sleep(0);
        return behavior == 'otherchain' ? 137 : 1;
      },
      getTransactionCount: async () => {
        await sleep(0);
        return 17;
      },
      getGasPrice: async () => {
        await sleep(0);
        if (behavior == 'overmax') return '999000000000';
        return '40000000000';
      },
      estimateGas: async () => {
        await sleep(0);
        return 500000;
      },
      sendSignedTransaction: async (_tx: unknown, callback: (err?: Error) => void) => {
        await sleep(0);
        if (behavior == 'badsend') callback(new Error('send error'));
        else callback();
      },
      getTransaction: async () => {
        await sleep(0);
        if (behavior == 'removed') return null;
        if (behavior == 'pending') return { blockNumber: null };
        else return { blockNumber: 117 };
      },
      getTransactionReceipt: async () => {
        await sleep(0);
        if (behavior == 'pending') return null;
        if (behavior != 'revert') return { status: true, blockNumber: 117 };
        else return { status: false, blockNumber: 117 };
      },
    },
  } as unknown) as Web3;
}

function getMockElectionsContract() {
  return ({
    options: {
      address: '0xaddress',
    },
    methods: {
      readyToSync: () => {
        return { encodeABI: () => '0xencodedAbi' };
      },
      readyForCommittee: () => {
        return { encodeABI: () => '0xencodedAbi' };
      },
      voteUnready: () => {
        return { encodeABI: () => '0xencodedAbi' };
      },
      canJoinCommittee: () => {
        return {
          call: async () => {
            await sleep(0);
            return true;
          },
        };
      },
    },
  } as unknown) as Contract;
}

function getMockSigner(successful = true) {
  return ({
    sign: async () => {
      await sleep(0);
      if (!successful) return {};
      return {
        rawTransaction: '0xrawTx',
        transactionHash: '0xtxHash',
      };
    },
  } as unknown) as Signer;
}

test('sendEthereumElectionsTransaction ready-for-committee successful after timeout', async (t) => {
  const state = newState();
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus([]);
  state.EthereumLastElectionsTx.Status = 'timeout';
  state.web3 = getMockWeb3Client();
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-for-committee', 'sender', state, exampleConfig);

  if (!state.EthereumLastElectionsTx) throw new Error(`EthereumLastElectionsTx not defined`);
  t.is(state.EthereumLastElectionsTx.LastPollTime, 0);
  t.is(state.EthereumLastElectionsTx.Type, 'ready-for-committee');
  t.assert(state.EthereumLastElectionsTx.SendTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.GasPriceStrategy, 'recommended');
  t.is(state.EthereumLastElectionsTx.GasPrice, 40000000000);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumLastElectionsTx.TxHash, '0xtxHash');
  t.is(state.EthereumLastElectionsTx.EthBlock, 0);
  t.falsy(state.EthereumLastElectionsTx.OnFinal);
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], undefined);
});

test('sendEthereumElectionsTransaction with a huge gas price is clamped to the max when the budget allows', async (t) => {
  const state = newState();
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus([]);
  state.EthereumLastElectionsTx.Status = 'timeout';
  state.web3 = getMockWeb3Client('overmax');
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  const config = { ...exampleConfig, EthereumMaxFeesPerTenDaysEth: 1 };
  await sendEthereumElectionsTransaction('ready-for-committee', 'sender', state, config);

  if (!state.EthereumLastElectionsTx) throw new Error(`EthereumLastElectionsTx not defined`);
  t.is(state.EthereumLastElectionsTx.GasPriceStrategy, 'recommended');
  t.is(state.EthereumLastElectionsTx.GasPrice, exampleConfig.EthereumMaxGasPrice);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumLastElectionsTx.TxHash, '0xtxHash');
  t.is(state.SpendingLimitReason, '');
});

test('sendEthereumElectionsTransaction is refused when its worst-case fee could break the 10-day budget', async (t) => {
  const state = newState();
  const previous = getExampleEthereumTxStatus([]);
  previous.Status = 'timeout';
  state.EthereumLastElectionsTx = previous;
  state.web3 = getMockWeb3Client('overmax'); // clamped to 150 gwei x (500k + 300k gas) = 0.12 ETH > 0.1 budget
  let signed = false;
  state.signer = ({ sign: async () => { await sleep(0); signed = true; return {}; } } as unknown) as Signer;
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-for-committee', 'sender', state, exampleConfig);

  t.false(signed);
  t.is(state.EthereumLastElectionsTx, previous); // nothing was sent: no failed-send, no new status
  t.true(state.SpendingLimitReason.startsWith('fee budget'));
});

test('sendEthereumElectionsTransaction is refused when fees already spent leave no room', async (t) => {
  const state = newState();
  state.EthereumFeesStats[getTenDayPeriod()] = 0.09; // + 40 gwei x 800k gas = 0.032 ETH > 0.1
  state.web3 = getMockWeb3Client();
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-to-sync', 'sender', state, exampleConfig);

  t.is(state.EthereumLastElectionsTx, undefined);
  t.true(state.SpendingLimitReason.startsWith('fee budget'));
});

test('the daily limit counts every tx mined from the address today (by nonce), across restarts', async (t) => {
  const state = newState();
  // restored from status.json: the first nonce seen today was 13; the mock RPC now says 17 = 4 txs mined today
  state.EthereumDailyNonce = { Day: getToday(), Nonce: 13 };
  state.web3 = getMockWeb3Client();
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-to-sync', 'sender', state, exampleConfig);

  t.is(state.EthereumLastElectionsTx, undefined);
  t.true(state.SpendingLimitReason.startsWith('daily tx limit reached: 4 txs'));
});

test('the daily nonce baseline resets on a new day', async (t) => {
  const state = newState();
  state.EthereumDailyNonce = { Day: '2000-01-01', Nonce: 1 };
  state.web3 = getMockWeb3Client();
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-to-sync', 'sender', state, exampleConfig);

  t.is(state.EthereumLastElectionsTx?.Status, 'pending');
  t.deepEqual(state.EthereumDailyNonce, { Day: getToday(), Nonce: 17 });
});

test('nothing is signed before the chain id is known', async (t) => {
  const state = newState();
  state.chainId = 0;
  state.web3 = getMockWeb3Client();
  let signed = false;
  state.signer = ({ sign: async () => { await sleep(0); signed = true; return {}; } } as unknown) as Signer;
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-to-sync', 'sender', state, exampleConfig);

  t.false(signed);
  t.is(state.EthereumLastElectionsTx?.Status, 'failed-send');
});

test('the signer is asked to verify the sender, and its failures are recorded as signer errors', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client();
  const calls: unknown[][] = [];
  state.signer = ({
    sign: async (...args: unknown[]) => {
      await sleep(0);
      calls.push(args);
      throw new Error('Bad response: Not Found');
    },
  } as unknown) as Signer;
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-to-sync', 'ABCDEF', state, exampleConfig);

  t.is(calls.length, 1);
  t.is(calls[0][1], 1); // chain id: EIP-155, never legacy signing
  t.is(calls[0][2], '0xabcdef'); // expected sender, lowercase as the client compares it
  t.is(state.EthereumLastElectionsTx?.Status, 'failed-send');
  t.is(state.SignerError?.Message, 'signer failed: Bad response: Not Found');
});

test('sendEthereumElectionsTransaction fails on send', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('badsend');
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-to-sync', 'sender', state, exampleConfig);

  if (!state.EthereumLastElectionsTx) throw new Error(`EthereumLastElectionsTx not defined`);
  t.assert(state.EthereumLastElectionsTx.SendTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'failed-send');
});

test('sendEthereumElectionsTransaction fails on sign', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client();
  state.signer = getMockSigner(false);
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-to-sync', 'sender', state, exampleConfig);

  if (!state.EthereumLastElectionsTx) throw new Error(`EthereumLastElectionsTx not defined`);
  t.assert(state.EthereumLastElectionsTx.SendTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'failed-send');
});

test('sendEthereumVoteUnreadyTransaction successful after failed send', async (t) => {
  const state = newState();
  state.EthereumLastVoteUnreadyTx = getExampleEthereumTxStatus([]);
  state.EthereumLastVoteUnreadyTx.Status = 'failed-send';
  state.ManagementRefTime = 99999;
  state.web3 = getMockWeb3Client();
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumVoteUnreadyTransaction([{ EthAddress: 'abc', Weight: 10 }], 'sender', state, exampleConfig);

  if (!state.EthereumLastVoteUnreadyTx) throw new Error(`EthereumLastVoteUnreadyTx not defined`);
  t.is(state.EthereumLastVoteUnreadyTx.LastPollTime, 0);
  t.is(state.EthereumLastVoteUnreadyTx.Type, 'vote-unready');
  t.assert(state.EthereumLastVoteUnreadyTx.SendTime > 1400000000);
  t.is(state.EthereumLastVoteUnreadyTx.GasPriceStrategy, 'recommended');
  t.is(state.EthereumLastVoteUnreadyTx.GasPrice, 40000000000);
  t.is(state.EthereumLastVoteUnreadyTx.Status, 'pending');
  t.is(state.EthereumLastVoteUnreadyTx.TxHash, '0xtxHash');
  t.is(state.EthereumLastVoteUnreadyTx.EthBlock, 0);
  t.truthy(state.EthereumLastVoteUnreadyTx.OnFinal);
  t.falsy(state.EthereumLastVoteUnreadyTime['abc']);
  state.EthereumLastVoteUnreadyTx.OnFinal?.();
  t.is(state.EthereumLastVoteUnreadyTime['abc'], 99999);
});

test('sendEthereumVoteUnreadyTransaction with no targets', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client();
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumVoteUnreadyTransaction([], 'sender', state, exampleConfig);
  t.falsy(state.EthereumLastVoteUnreadyTx);
});

test('sendEthereumVoteUnreadyTransaction fails on send', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('badsend');
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumVoteUnreadyTransaction([{ EthAddress: 'abc', Weight: 10 }], 'sender', state, exampleConfig);

  if (!state.EthereumLastVoteUnreadyTx) throw new Error(`EthereumLastVoteUnreadyTx not defined`);
  t.assert(state.EthereumLastVoteUnreadyTx.SendTime > 1400000000);
  t.is(state.EthereumLastVoteUnreadyTx.Status, 'failed-send');
});

test('sendEthereumVoteUnreadyTransaction fails on sign', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client();
  state.signer = getMockSigner(false);
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumVoteUnreadyTransaction([{ EthAddress: 'abc', Weight: 10 }], 'sender', state, exampleConfig);

  if (!state.EthereumLastVoteUnreadyTx) throw new Error(`EthereumLastVoteUnreadyTx not defined`);
  t.assert(state.EthereumLastVoteUnreadyTx.SendTime > 1400000000);
  t.is(state.EthereumLastVoteUnreadyTx.Status, 'failed-send');
});

// reflects a tx status for a recent pending tx that already has tx hash but no block number
function getExampleEthereumTxStatus(arr: number[]): EthereumTxStatus {
  return {
    LastPollTime: 0,
    Type: 'ready-to-sync',
    SendTime: getCurrentClockTime(),
    GasPriceStrategy: 'discount',
    GasPrice: 30000000000,
    Status: 'pending',
    TxHash: 'abc',
    EthBlock: 0,
    OnFinal: () => {
      arr.push(1);
    },
  };
}

test('readPendingTransactionStatus on a recent pending tx that still has no txHash', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('pending');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.TxHash = '';
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime == 0);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumConsecutiveTxTimeouts, 3);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on an old pending tx that still has no txHash', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('pending');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.TxHash = '';
  state.EthereumLastElectionsTx.SendTime = getCurrentClockTime() - 24 * 60 * 60;
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime == 0);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumConsecutiveTxTimeouts, 3);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on a recent pending tx that has txHash but no block', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('pending');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumConsecutiveTxTimeouts, 3);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on an old pending tx that has txHash but no block', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('pending');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.SendTime = getCurrentClockTime() - 24 * 60 * 60;
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'timeout');
  t.is(state.EthereumConsecutiveTxTimeouts, 4);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on a recent pending tx that becomes committed in block', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('success');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumLastElectionsTx.EthBlock, 117);
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 2);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on an old pending tx that becomes committed in block', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('success');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.SendTime = getCurrentClockTime() - 24 * 60 * 60;
  state.EthereumConsecutiveTxTimeouts = 3;
  // state.EthereumCommittedTxStats[getToday()] does not exist
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumLastElectionsTx.EthBlock, 117);
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on a recent pending tx that becomes removed from pool', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('removed');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'pending'); // this used to return error
  t.is(state.EthereumConsecutiveTxTimeouts, 3);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on a recent pending tx that becomes reverted in block', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('revert');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'revert');
  t.is(state.EthereumLastElectionsTx.EthBlock, 117);
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 2);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on a recent pending tx committed in block but not final', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('success');
  state.ManagementEthRefBlock = 100;
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.EthBlock = 117;
  state.EthereumConsecutiveTxTimeouts = 0;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime == 0);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on an old pending tx committed in block but not final', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('success');
  state.ManagementEthRefBlock = 100;
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.SendTime = getCurrentClockTime() - 24 * 60 * 60;
  state.EthereumLastElectionsTx.EthBlock = 117;
  state.EthereumConsecutiveTxTimeouts = 0;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime == 0);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on a recent pending tx committed in block that becomes final', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('success');
  state.ManagementEthRefBlock = 122;
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.EthBlock = 117;
  state.EthereumConsecutiveTxTimeouts = 0;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime == 0);
  t.is(state.EthereumLastElectionsTx.Status, 'final');
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 1);
});

test('readPendingTransactionStatus on an old pending tx committed in block that becomes final', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('success');
  state.ManagementEthRefBlock = 122;
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.SendTime = getCurrentClockTime() - 24 * 60 * 60;
  state.EthereumLastElectionsTx.EthBlock = 117;
  state.EthereumConsecutiveTxTimeouts = 0;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime == 0);
  t.is(state.EthereumLastElectionsTx.Status, 'final');
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 1);
});

test('getReceiptFeeInEth', (t) => {
  const mockReceipt: TransactionReceipt = ({
    gasUsed: 258406,
  } as unknown) as TransactionReceipt;
  const mockStatus: EthereumTxStatus = ({
    GasPrice: 65000000000,
  } as unknown) as EthereumTxStatus;
  t.is(getReceiptFeeInEth(mockReceipt, mockStatus), 0.01679639);
});

test('queryCanJoinCommittee works', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client();
  state.ethereumElectionsContract = getMockElectionsContract();

  t.is(await queryCanJoinCommittee(exampleConfig.NodeOrbsAddress, state), true);
});
test('the chain is checked again right before signing: a switched RPC signs nothing and keeps the previous tx', async (t) => {
  const state = newState();
  state.web3 = getMockWeb3Client('otherchain');
  let signed = false;
  state.signer = ({ sign: async () => { await sleep(0); signed = true; return {}; } } as unknown) as Signer;
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-to-sync', 'sender', state, exampleConfig);

  t.false(signed);
  t.is(state.EthereumLastElectionsTx, undefined); // nothing was sent, so no new tx status
  t.is(state.chainId, 0);
  t.is(state.ChainCheckError, 'chain id mismatch: RPC reports 137, expected 1');
});

test('a reached daily limit is reported even when no tx is due', (t) => {
  const state = newState();
  t.is(dailyLimitReachedReason(state, exampleConfig), '');
  state.EthereumCommittedTxStats[getToday()] = exampleConfig.EthereumMaxCommittedDailyTx - 1;
  t.is(dailyLimitReachedReason(state, exampleConfig), '');
  state.EthereumCommittedTxStats[getToday()] = exampleConfig.EthereumMaxCommittedDailyTx;
  t.is(
    dailyLimitReachedReason(state, exampleConfig),
    'daily tx limit reached: 4 txs committed today (max 4), nothing is sent until the next UTC day'
  );
  state.EthereumCommittedTxStats = { '2000-01-01': 9 }; // other days do not count
  t.is(dailyLimitReachedReason(state, exampleConfig), '');
});
