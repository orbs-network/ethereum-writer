//const Web3 = require('web3');

import Web3 from 'web3';
//const MultiHttpProvider = require('multi-http-provider');
import MultiHttpProvider from './multi-http-provider.js';

const providerUrls = [
    'http://localhost:2999/stupid_response.json',
    'https://rpc.ankr.com/eth',
    'http://localhost:8080/rpc?chain=ethereum&appId=jordan'
];

(async () => {
    const fallbackProvider = new MultiHttpProvider(providerUrls, { timeout: 10000 });
    const web3 = new Web3(fallbackProvider);

    const usdcAbi = [
        {
            "constant": true,
            "inputs": [{"name": "account", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "", "type": "uint256"}],
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [],
            "name": "decimals",
            "outputs": [{"name": "", "type": "uint8"}],
            "type": "function"
        }
    ];

    const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC on Ethereum
    const testWallet = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'; // Known whale address

    const contract = new web3.eth.Contract(usdcAbi, usdcAddress);

    for (let i = 0; i < 1; i++) {
        try {
            const rawBalance = await contract.methods.balanceOf(testWallet).call();
            const decimals = await contract.methods.decimals().call();

            // const [rawBalance, decimals] = await Promise.all([
            //   contract.methods.balanceOf(testWallet).call(),
            //   contract.methods.decimals().call()
            // ]);
            const humanReadable = rawBalance / (10 ** decimals);

            console.log(`USDC Balance of ${testWallet}: ${humanReadable.toLocaleString()} USDC`);

        } catch (err) {
            console.error('Contract call failed:', err.message);
        }
    }
})();