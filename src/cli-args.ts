import { Configuration, validateConfiguration, defaultConfiguration } from './config';
import { setConfigEnvVars } from './env-var-args';
import yargs from 'yargs';
import { readFileSync } from 'fs';
import * as Logger from './logger';

export function parseArgs(argv: string[]): Configuration {
  let res: Configuration;

  // parse command line args
  const args = yargs(argv)
    .option('config', {
      type: 'array',
      required: false,
      string: true,
      description: 'list of config files',
    })
    .exitProcess(false)
    .parse();

  // read input config JSON files
  // If config.json not provided, required config values must be passed via environment variables
  try {
    res = Object.assign(
      {},
      defaultConfiguration,
      ...(args.config ?? []).map((configPath) => JSON.parse(readFileSync(configPath).toString()))
    );
    // check the type of EthereumEndpoint to be an array
    if (res.EthereumEndpoint && !Array.isArray(res.EthereumEndpoint)) {
      res.EthereumEndpoint = [res.EthereumEndpoint];
    }

    if (res.EthereumEndpoint && res.EthereumEndpoint.length > 0) {
      if (JSON.stringify(res.EthereumEndpoint).includes('polygon') || JSON.stringify(res.EthereumEndpoint).includes('matic')) {
        if (!JSON.stringify(res.EthereumEndpoint).includes('rpcman')) {
          res.EthereumEndpoint.push('https://rpcman-fastly.orbs.network/rpc?chain=polygon&appId=guardian&key=888798GHWJ759843GFDSJK759843');
        }
      } else {
        if (!JSON.stringify(res.EthereumEndpoint).includes('rpcman')) {
          res.EthereumEndpoint.push('https://rpcman-fastly.orbs.network/rpc?chain=ethereum&appId=guardian&key=888798GHWJ759843GFDSJK759843');
        }
      }
    }
  } catch (err) {
    Logger.error(`Cannot parse input JSON config files: [${args.config}].`);
    throw err;
  }

  // Support passing required config values via environment variables
  setConfigEnvVars(res);

  // validate JSON config
  try {
    validateConfiguration(res);
  } catch (err) {
    Logger.error(`Invalid JSON config: '${JSON.stringify(res)}'.`);
    throw err;
  }

  return res;
}
