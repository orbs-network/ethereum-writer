import Web3 from 'web3';

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

export default MultiHttpProvider;