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
| `ManagementServiceEndpointSchema` | Local schema of the Public API HTTP endpoint of the management service where `{GUARDIAN_IP}` is a replacable parameter of the IP address of any guardian of the network.<br>Default: 'http://{{GUARDIAN_IP}}/services/management-service/status' |
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
| `SuspendVoteUnready` | Should the node avoid sending actual vote-unready transactions to Ethereum and instead just log the intent.<br>Default: `false` |
| `EthereumDiscountGasPriceFactor` | When trying to send transactions to Ethereum, the first attempt tries to reduce the recommended gas price and send under a discount.<br>Default: `0.75` |
| `EthereumDiscountTxTimeoutSeconds` | On the first attempt of sending transactions to Ethereum under discount, how long to wait before considering the transaction timed out.<br>Default: `3600` (1 hour) |
| `EthereumNonDiscountTxTimeoutSeconds` | On the following attempts of sending transactions to Ethereum without discount, how long to wait before considering the transaction timed out.<br>Default: `600` (10 minutes) |
| `EthereumMaxGasPrice` | What is the maximum gas price that will be used for sending transactions to Ethereum.<br>Default: `500000000000` (500 gwei) |
| `EthereumMaxCommittedDailyTx` | The maximum allowed number of transactions sent to Ethereum in one day (actually committed, could be either successful or reverted). This protects against bugs that may cause too many transactions to be sent and Ether balance to drain.<br>Default: `4` |

## Developer instructions

### Install dev environment

* Make sure [Node.js](https://nodejs.org/) is installed (min 12.14.0).

  * Install with `brew install node`, check version with `node -v`.

* [VSCode](https://code.visualstudio.com/) is recommended as IDE.

  * Recommended extensions [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint), [Prettier - code Formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode).

* [Docker](https://www.docker.com/) is required for running E2E tests.

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

* For E2E tests (on docker), run in terminal in root project directory:

  ```
  npm run build
  npm run test:e2e
  ```

  * Note: running E2E locally may leave docker residues:

    * See which instances are running with `docker ps`, stop all with `docker stop $(docker ps -a -q)`

    * See which images exist with `docker images`, delete all relevant with `docker rmi $(docker images --format '{{.Repository}}:{{.Tag}}' | grep 'cicontainer')`


### Matic-writer - Polygon

The code has been updated to add EVM write capabilities for Polygon network, as well as Ethereum in order to support polygon proof of stake functionality as of March 29 2022.

the network runs another docker image of this repo under the name __matic-writer__ to support writing to POS contracts on polygon network.