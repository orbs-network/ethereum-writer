const Web3 = require('web3');

class MultiHttpProvider {
    constructor(urls, options = {}) {
        if (!Array.isArray(urls) || urls.length === 0) {
            throw new Error("Must provide at least one URL");
        }

        this.urls = urls;
        this.timeout = options.timeout || 10000;
        this.options = options;
        this.lastWorkingIndex = 0;
        this.attemptIds = new Set();
    }

    _getProvider(index) {
        return new Web3.providers.HttpProvider(this.urls[index], {
            timeout: this.timeout,
            ...this.options,
        });
    }

    send(payload, callback) {
        const tried = new Set();

        const tryProvider = (index) => {
            if (index >= this.urls.length || tried.size === this.urls.length) {
                return callback(new Error('All providers failed'), null);
            }

            if (tried.has(index)) {
                return tryProvider(index + 1); // skip already tried
            }

            const provider = this._getProvider(index);
            tried.add(index);

            const attemptId = Math.floor(Math.random() * 1000000);
            this.attemptIds.add(attemptId);

            provider.send(payload, (err, result) => {
                if (!this.attemptIds.has(attemptId)) {
                    this.attemptIds.delete(attemptId);
                    console.log(`Attempt ID ${attemptId} already resolved, ignoring response`);
                    return;
                }

                this.attemptIds.delete(attemptId);

                if (err || (result && result.error)) {
                    this.lastWorkingIndex = 0;
                    console.log (`Provider '${provider.host}' failed, doing fallback to next provider`);
                    return tryProvider(index + 1);
                } else {
                    if (this.lastWorkingIndex !== index) {
                        console.log(`Provider '${provider.host}' succeeded, caching as last working provider`);
                    }
                    this.lastWorkingIndex = index; // cache good one
                    return callback(null, result);
                }
            });
        };

        tryProvider(this.lastWorkingIndex); // start with cached good provider
    }

    sendAsync(payload, callback) {
        this.send(payload, callback);
    }
}

const providerUrls = [
    'http://localhost:2999',
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

    for (let i = 0; i < 10000; i++) {
        try {
            // const rawBalance = await contract.methods.balanceOf(testWallet).call();
            // const decimals = await contract.methods.decimals().call();

            const [rawBalance, decimals] = await Promise.all([
              contract.methods.balanceOf(testWallet).call(),
              contract.methods.decimals().call()
            ]);
            const humanReadable = rawBalance / (10 ** decimals);

            console.log(`USDC Balance of ${testWallet}: ${humanReadable.toLocaleString()} USDC`);

        } catch (err) {
            console.error('Contract call failed:', err.message);
        }
    }
})();