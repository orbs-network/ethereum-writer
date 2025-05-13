import * as Logger from './logger';
import { runLoop } from '.';
import { parseArgs } from './cli-args';

process.on('uncaughtException', function (err) {
  Logger.log('Uncaught exception on process, shutting down:');
  Logger.error(err.stack);
  process.exit(1);
});

process.on('SIGINT', function () {
  Logger.log('Received SIGINT, shutting down.');
  process.exit();
});

Logger.log('Service ethereum-writer started.');
const config = parseArgs(process.argv);
const censoredConfig = Object.assign({}, config);
censoredConfig.EthereumEndpoint = censoredConfig.EthereumEndpoint.map((endpoint) => endpoint.slice(0, 30) + "**********");

Logger.log(`Input config: '${JSON.stringify(censoredConfig)}'.`);

runLoop(config, censoredConfig).catch((err) => {
  Logger.log('Exception thrown from runLoop, shutting down:');
  Logger.error(err.stack);
  process.exit(128);
});
