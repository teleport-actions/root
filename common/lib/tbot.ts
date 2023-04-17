import * as fs from 'fs/promises';
import * as path from 'path';

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as yaml from 'yaml';

import * as io from './io';

export interface SharedInputs {
  proxy: string;
  token: string;
  debug: boolean;
  certificateTTL: string;
  anonymousTelemetry: boolean;
}

function stringToBool(str: string): boolean {
  if (str === '') {
    return false;
  }
  return /^\s*(true|1)\s*$/i.test(str);
}

export function getSharedInputs(): SharedInputs {
  const proxy = core.getInput('proxy', { required: true });
  const token = core.getInput('token', { required: true });
  const certificateTTL = core.getInput('certificate-ttl');
  const anonymousTelemetry = stringToBool(core.getInput('anonymous-telemetry'));

  return {
    proxy,
    token,
    certificateTTL,
    anonymousTelemetry,
    debug: core.isDebug(),
  };
}

// See https://github.com/gravitational/teleport/blob/master/lib/tbot/config/config.go#L206
// For configuration references
export interface ConfigurationV1Destination {
  directory: {
    path: string;
    symlinks: 'try-secure' | 'secure' | 'insecure';
  };
  roles: Array<string>;
  kubernetes_cluster?: string;
  app?: string;
}
export interface ConfigurationV1 {
  auth_server: string;
  oneshot: boolean;
  debug: boolean;
  certificate_ttl?: string;
  onboarding: {
    join_method: string;
    token: string;
  };
  storage: {
    memory?: boolean;
    directory?: string;
  };
  destinations: Array<ConfigurationV1Destination>;
}

export function baseConfigurationFromSharedInputs(
  inputs: SharedInputs
): ConfigurationV1 {
  const cfg: ConfigurationV1 = {
    auth_server: inputs.proxy,
    oneshot: true,
    debug: inputs.debug,
    onboarding: {
      join_method: 'github',
      token: inputs.token,
    },
    storage: {
      // We use memory storage here so we avoid ever writing the bots more
      // powerful credentials to disk.
      memory: true,
    },
    destinations: [],
  };

  if (inputs.certificateTTL) {
    cfg.certificate_ttl = inputs.certificateTTL;
  }

  return cfg;
}

export async function writeConfiguration(
  config: ConfigurationV1
): Promise<string> {
  const tempDir = await io.makeTempDirectory();
  const configPath = path.join(tempDir, 'bot-config.yaml');
  const data = yaml.stringify(config);

  core.debug('Writing tbot configuration to ' + configPath);
  core.debug('Configuration value:\n' + data);
  await fs.writeFile(configPath, data);
  return configPath;
}

export function baseEnvFromSharedInputs(
  inputs: SharedInputs,
  name: string,
  version: string
): {
  [key: string]: string;
} {
  const env: {
    [key: string]: string;
  } = {};

  for (const key in process.env) {
    const val = process.env[key];
    if (val) {
      env[key] = val;
    }
  }

  env['TELEPORT_ANONYMOUS_TELEMETRY'] = inputs.anonymousTelemetry ? '1' : '0';
  env['_TBOT_TELEMETRY_HELPER'] = name;
  env['_TBOT_TELEMETRY_HELPER_VERSION'] = version;

  return env;
}

export async function execute(
  configPath: string,
  env: { [key: string]: string }
) {
  core.info('Invoking tbot with configuration at ' + configPath);
  await exec.exec('tbot', ['start', '-c', configPath], {
    env,
  });
}
