import * as Logger from './logger';
import { runLoop } from '.';
import { parseArgs } from './cli-args';
import { publicConfig } from './public-config';
import { describeErrorStack, installOutputScrubber, registerSecretUrls } from './redact';

// Scrub the RPC URL from everything written to stdout/stderr, before anything can log it.
// The env var is registered first so even a config that fails to parse cannot leak it.
registerSecretUrls([process.env.ETHEREUM_ENDPOINT]);
installOutputScrubber();

process.on('uncaughtException', function (err) {
  Logger.log('Uncaught exception on process, shutting down:');
  Logger.error(describeErrorStack(err));
  process.exit(1);
});

process.on('unhandledRejection', function (reason) {
  Logger.log('Unhandled promise rejection on process, shutting down:');
  Logger.error(describeErrorStack(reason));
  process.exit(1);
});

process.on('SIGINT', function () {
  Logger.log('Received SIGINT, shutting down.');
  process.exit();
});

process.on('SIGTERM', function () {
  Logger.log('Received SIGTERM, shutting down.');
  process.exit();
});

Logger.log('Service ethereum-writer started.');
const config = parseArgs(process.argv);
registerSecretUrls([config.EthereumEndpoint]);
Logger.log(`Input config: '${JSON.stringify(publicConfig(config))}'.`);

runLoop(config).catch((err) => {
  Logger.log('Exception thrown from runLoop, shutting down:');
  Logger.error(describeErrorStack(err));
  process.exit(128);
});
