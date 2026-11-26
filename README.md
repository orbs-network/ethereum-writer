# Ethereum Writer Service

Node service to send Ethereum transactions for elections lifecycle (like auto vote unready).

## How to run

The service is packaged as a Docker image. It is routinely published from this repo to [Docker Hub](https://hub.docker.com/repository/docker/orbsnetwork/ethereum-writer).

### Command-line arguments

| Argument | Description |
| -------- | ----------- |
| `--config <path>` | Path for a JSON configuration file. Multiple files can be given one after the other. (see JSON format below). | 

### Static JSON config file

* [Example as JavaScript code](src/config.example.ts)

| Field Name | Description |
| ---------- | ----------- |
| `ManagementServiceEndpoint` | HTTP URL endpoint of an instance of [management service](https://github.com/orbs-network/orbs-spec/blob/master/node-architecture/MGMT-SERVICE.md), for example `http://management-service:8080`. | 
| `EthereumEndpoint` | HTTP URL endpoint for an Ethereum full node which will be used for all Ethereum queries and sending transactions. |
| `SignerEndpoint` | HTTP URL endpoint of an instance of [signer service](https://github.com/orbs-network/signer-service), for example `http://signer:7777`. |
| `EthereumElectionsContract` | Ethereum address of Orbs V2 [Elections](https://github.com/orbs-network/orbs-ethereum-contracts-v2/blob/master/contracts/spec_interfaces/IElections.sol) contract, for example `0x02Ca9F2c5dD0635516241efD480091870277865b`. |
| `NodeOrbsAddress` | The Orbs address of the node, configured during [initialization](https://github.com/orbs-network/validator-instructions) with Polygon, for example `8cd2a24f0c3f50bce2f12c846277491433b47ae0`. |
| `ManagementServiceEndpointSchema` | Local schema of the Public API HTTP endpoint of the management service where `{{GUARDIAN_IP}}` is a replaceable parameter of the IP address of any guardian of the network.<br>Default: 'http://{{GUARDIAN_IP}}/services/management-service/status' |
| `StatusJsonPath` | The local path on disk where status JSON should be written by the service.<br>Default: `./status/status.json` |
| `RunLoopPollTimeSeconds` | The interval in seconds of how often the runloop of the service wakes up to execute its routine of reading data, update state and write side effects.<br>Default: `120` (2 minutes) |
| `EthereumBalancePollTimeSeconds` | How often in seconds should Ether balance be queried, must be a a multiple of `RunLoopPollTimeSeconds`.<br>Default: `14400` (4 hours) |
| `EthereumCanJoinCommitteePollTimeSeconds` | How often in seconds should the service query the Ethereum Elections contract to check whether a node that isn't in the committee can successfully join it.<br>Default: `600` (10 minutes) |
| `OrbsReputationsContract` | The name of the Orbs smart contract running on a virtual chain that returns reputation scores for all peers.<br>Default: `_Committee` |
| `EthereumSyncRequirementSeconds` | How near Ethereum Management ref time should be for Ethereum to be considered synchronized, `ETHEREUM_PROGRESS_REQ` in the spec.<br>Default: `1200` (20 minutes) |
| `FailToSyncVcsTimeoutSeconds` | If virtual chains could not be properly synchronized within this time frame, the node will require reset, `FAIL_TO_SYNC_TIMEOUT` in the spec.<br>Default: `86400` (24 hours) |
| `ElectionsRefreshWindowSeconds` | Committee update stale window, `REFRESH_WINDOW` in the spec.<br>Default: `7200` (2 hours) |
| `InvalidReputationGraceSeconds` | Time validator needs to have invalid reputation for vote unready to be sent, `INVALID_REPUTATION_GRACE` in the spec.<br>Default: `108000` (30 hours) |
| `VoteUnreadyValiditySeconds` | How often vote outs should be resent against the same validator, `VOTEOUT_VALIDAITY` in the spec.<br>Default: `604800` (7 days) |
| `ElectionsAuditOnly` | Whether the node is audit only and should avoid joining the committee as elected validator and remain standby in the topology instead.<br>Default: `false` |
| `SuspendVoteUnready` | Should the node avoid sending actual vote-unready transactions to Ethereum and instead just log the intent.<br>Default: `true` |
| `EthereumDiscountGasPriceFactor` | When trying to send transactions to Ethereum, the first attempt tries to reduce the recommended gas price and send under a discount.<br>Default: `0.75` |
| `EthereumDiscountTxTimeoutSeconds` | On the first attempt of sending transactions to Ethereum under discount, how long to wait before considering the transaction timed out.<br>Default: `3600` (1 hour) |
| `EthereumNonDiscountTxTimeoutSeconds` | On the following attempts of sending transactions to Ethereum without discount, how long to wait before considering the transaction timed out.<br>Default: `600` (10 minutes) |
| `EthereumMaxGasPrice` | What is the maximum gas price that will be used for sending transactions to Ethereum (a higher recommended price is clamped to it).<br>Default: `100000000000` (100 gwei) |
| `EthereumMaxCommittedDailyTx` | The maximum number of transactions mined from the guardian address in one UTC day (successful or reverted), counted from the account nonce, so txs mined after a timeout or sent by anyone else with the same key count too. This protects against bugs that may cause too many transactions to be sent and Ether balance to drain.<br>Default: `4` |
| `EthereumMaxFeesPerTenDaysEth` | Spending budget in ETH per 10-day period. A transaction is not signed if its worst-case fee (gas limit x gas price) could take the period's fees above it.<br>Default: `0.1` |
| `EthereumChainId` | Chain id the RPC must report. Checked every run loop tick and again right before signing; on the first match the Elections contract must also have code on the RPC. On a mismatch nothing is read from the RPC or signed, and status shows `BlockedBy ethereum-rpc` with the reason until it matches again.<br>Default: `1` (Ethereum mainnet), env `ETHEREUM_CHAIN_ID` |

Every field can also be set by an environment variable with the same name in `UPPER_SNAKE_CASE` (for example `ETHEREUM_MAX_FEES_PER_TEN_DAYS_ETH`); `NodeOrbsAddress` is `NODE_ADDRESS`. On v5 nodes the config comes from environment variables only.

The spending counters (daily txs, fees, the first nonce of the day) and a transaction still in flight are restored from the previous `status.json` on startup, so a restart does not reset the limits. The service never reads a private key: all signing goes through `SignerEndpoint`.

### Status (`status.json`)

`status.json` is public on v5 nodes. It never contains the RPC URL: `Payload.Config` is an allowlist (`src/public-config.ts`) and the whole file, like all log output, is scrubbed of every part of `EthereumEndpoint` (`src/redact.ts`).

| Field | Meaning |
| ----- | ------- |
| `Status` | One-line summary, most important first: `Starting`, `Operational`, `Tx pending: …`, `Blocked by <component>: <reason>`, `Spending limit reached`, `Out of sync` or `Needs reset`, then balance and fees. |
| `Error` | Empty only when healthy. Anything the service cannot vouch for (starting, reader not usable, balance unknown, a failed tick) is an error. |
| `Timestamp` | ISO time of the write. Written on startup, after every run loop tick and on state transitions. The healthcheck fails if it is older than 20 minutes. |
| `Payload.Uptime`, `Payload.Version {Semantic, Commit}`, `Payload.MemoryUsage` | Process facts. |
| `Payload.BlockedBy {Component, Reason}` | Set when the error is downstream of another component: `ethereum-reader` (starting, syncing, erroring, unreachable or stale), `signer` or `ethereum-rpc`. |
| `Payload.Reader {Status, Reason}` | Whether the reader's last status could be acted on. While the reader reports `Payload.Sync.State = "syncing"` or a non-empty `Error`, the writer applies none of its data and decides no transactions. |
| `Payload.EthereumSync {LastRpcErrorAt, LastRpcError, RpcErrorsLastHour}` | Every failed Ethereum RPC call, same fields as evm-reader: unix seconds and URL-free text of the last one (kept after later successes), and counts over the last hour as `{Timeout, RangeLimit, RateLimit, Other}` (`RangeLimit` is always 0 here). |

### Vote unready timing

Every run loop tick (`RunLoopPollTimeSeconds`, 2 minutes) the writer samples each committee member's reader status. A sample is bad when the peer cannot be reached or its `CurrentRefTime` is `InvalidEthereumSyncSeconds` (1 hour) or more behind. Only freshness is used: a peer's data is never applied.

With the defaults, a peer is voted unready only when all of the following hold:

1. At least `InvalidReputationThreshold` (50%) of its last `ReputationSampleSize` (100) samples are bad. That is about 100 minutes of bad samples.
2. It stays bad without a break for `InvalidReputationGraceSeconds` (30 hours). Recovering restarts this.
3. The median peer is at most `InvalidReputationCheckThreshold` (20%) bad. If many peers look bad at once, the problem is more likely ours and nobody is voted.
4. This node is in the committee, its own reader is usable and in sync, and the daily tx limit is not reached.

So a peer must look out of sync for roughly 31.5 hours before a vote. A full v5 ethereum-reader resync (about 1.3 hours) or a restart never triggers one. Peers that report `Sync.State = "syncing"` are deliberately not skipped: a reader stuck syncing is the failure vote unready exists for. `SuspendVoteUnready` (default `true`, env `SUSPEND_VOTE_UNREADY`) only logs the decision instead of sending it. These defaults are pinned by tests in `src/model/logic-voteunready.test.ts`.

Reputation reflects only a peer's Ethereum sync, never its Polygon (matic) sync, and this is intentional. Samples fetch `ManagementServiceEndpointSchema`, by default `http://<peer ip>/services/management-service/status`. On v5 nodes nginx routes that path to `ethereum-reader`; on legacy nodes it is the Ethereum management service. A peer's `matic-reader` being slow, stuck or down therefore never affects its reputation or any vote unready. This keeps the signal simple and stops a slow Polygon backend from getting committee nodes voted out. Do not add matic to reputation.

## Developer instructions

### Install dev environment

* Make sure [Node.js](https://nodejs.org/) is installed (min 12.14.0).

  * Install with `brew install node`, check version with `node -v`.

* [VSCode](https://code.visualstudio.com/) is recommended as IDE.

  * Recommended extensions [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint), [Prettier - code Formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode).

* [Docker](https://www.docker.com/) is required for building the image.

  * Install [here](https://docs.docker.com/install/), check version with `docker -v`.

* Run in terminal in root project directory:

  ```
  npm install
  npm test
  ```

## Build

* Run in terminal in root project directory:

  ```
  npm run build
  ```

  > Note that the Python errors `gyp ERR! find Python` on `keccak node-gyp rebuild` are ok.

* Built code will be inside `./dist`.

  * Run it with `npm start`.

* Docker image will be built and tagged as `local/ethereum-writer`.

  * Run it with `docker run local/ethereum-writer`.

## Test

* For unit tests, run in terminal in root project directory:

  ```
  npm run test
  ```

  To run a single test:

  ```
  npm run test:quick -- src/config.test.ts
  ```

### Matic-writer - Polygon

The code has been updated to add EVM write capabilities for Polygon network, as well as Ethereum in order to support polygon proof of stake functionality as of March 29 2022.

the network runs another docker image of this repo under the name __matic-writer__ to support writing to POS contracts on polygon network.