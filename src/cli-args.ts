import { Configuration, validateConfiguration, defaultConfiguration } from './config';
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
  } catch (err) {
    Logger.error(`Cannot parse input JSON config files: [${args.config}].`);
    throw err;
  }

  // Support passing required config values via environment variables
  res.ManagementServiceEndpoint = process.env.MANAGEMENT_SERVICE_ENDPOINT ?? res.ManagementServiceEndpoint;
  res.EthereumEndpoint = process.env.ETHEREUM_ENDPOINT ?? res.EthereumEndpoint;
  res.SignerEndpoint = process.env.SIGNER_ENDPOINT ?? res.SignerEndpoint;
  res.EthereumElectionsContract = process.env.ETHEREUM_ELECTIONS_CONTRACT ?? res.EthereumElectionsContract;
  res.NodeOrbsAddress = process.env.NODE_ORBS_ADDRESS ?? res.NodeOrbsAddress;

  // validate JSON config
  try {
    validateConfiguration(res);
  } catch (err) {
    Logger.error(`Invalid JSON config: '${JSON.stringify(res)}'.`);
    throw err;
  }

  return res;
}
