import * as Logger from './logger';
import { runLoop } from '.';
import { parseArgs } from './cli-args';
import process from "process";

process.on('uncaughtException', function (err) {
  Logger.log('Uncaught exception on process, shutting down:');
  Logger.error(err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason: any, promise) => {
  Logger.log(`Unhandled Rejection on promise ${promise}: ${reason.stack}`);
});

['exit', 'SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => process.on(signal, (code) => {
  Logger.log(`Received ${signal} with code ${code}, shutting down.`);
  console.trace();
  Logger.log(new Error().stack);
  process.exit(666);
}));

Logger.log('Service ethereum-writer started.');
const config = parseArgs(process.argv);
Logger.log(`Input config: '${JSON.stringify(config)}'.`);

runLoop(config).catch((err) => {
  Logger.log('Exception thrown from runLoop, shutting down:');
  Logger.error(err.stack);
  process.exit(128);
});
