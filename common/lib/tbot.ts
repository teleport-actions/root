import * as fs from 'fs/promises';
import * as path from 'path';

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as yaml from 'yaml';
import * as semver from 'semver';

import * as io from './io';

export interface SharedInputs {
  proxy: string;
  token: string;
  certificateTTL: string;
  anonymousTelemetry: boolean;
  caPins: string[];
  disableEnvVars: boolean;
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
  const caPins = core.getMultilineInput('ca-pins');
  const disableEnvVars = stringToBool(core.getInput('disable-env-vars'));

  return {
    proxy,
    token,
    certificateTTL,
    anonymousTelemetry,
    caPins,
    disableEnvVars,
  };
}

export interface DirectoryDestination {
  type: 'directory';
  path: string;
  symlinks: 'try-secure' | 'secure' | 'insecure';
}

export interface MemoryDestination {
  type: 'memory';
}

export type Destination = DirectoryDestination | MemoryDestination;

export interface IdentityOutput {
  type: 'identity';
  destination: Destination;
  roles: Array<string>;
}

export interface KubernetesOutput {
  type: 'kubernetes';
  destination: Destination;
  roles: Array<string>;
  kubernetes_cluster: string;
}

export interface ApplicationOutput {
  type: 'application';
  destination: Destination;
  roles: Array<string>;
  app_name: string;
}

export type Output = IdentityOutput | KubernetesOutput | ApplicationOutput;

export interface Configuration {
  version: 'v2';
  auth_server: string;
  oneshot: boolean;
  certificate_ttl?: string;
  onboarding: {
    join_method: string;
    token: string;
    ca_pins: string[];
  };
  storage: Destination;
  outputs: Array<Output>;
}

export function baseConfigurationFromSharedInputs(
  inputs: SharedInputs
): Configuration {
  const storage: MemoryDestination = {
    type: 'memory',
  };
  const cfg: Configuration = {
    version: 'v2',
    auth_server: inputs.proxy,
    oneshot: true,
    onboarding: {
      join_method: 'github',
      token: inputs.token,
      ca_pins: inputs.caPins,
    },
    storage: storage,
    outputs: [],
  };

  if (inputs.certificateTTL) {
    cfg.certificate_ttl = inputs.certificateTTL;
  }

  return cfg;
}

export async function writeConfiguration(
  config: Configuration
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

  // Some environment variables are set by our actions and can then end up
  // being used by a second call to our actions. This causes an error as both
  // variables for proxy and auth addr can be set and tbot rejects this. Since
  // we're explicitly configuring tbot, we can remove these variables.
  delete env['TELEPORT_PROXY'];
  delete env['TELEPORT_AUTH_SERVER'];

  return env;
}

export async function execute(
  configPath: string,
  env: { [key: string]: string }
) {
  core.info('Invoking tbot with configuration at ' + configPath);
  const args = ['start', '-c', configPath];
  if (core.isDebug()) {
    args.push('--debug');
  }
  await exec.exec('tbot', args, {
    env,
  });
}

// versionRegex extracts a version from a string like
// "Teleport v13.1.0 git:v13.1.0-0-gd83ec74 go1.20.4"
// Or on Enterprise:
// "Teleport Enterprise v13.1.0 git:v13.1.0-0-gd83ec74 go1.20.4"
// -> 13.1.0
const versionRegex = new RegExp('Teleport (?:Enterprise )?v(?<version>[^ ]*)');

async function getVersion(): Promise<string> {
  const out = await exec.getExecOutput('tbot', ['version']);
  const matchArray = out.stdout.match(versionRegex);
  const version = matchArray?.groups?.version;
  if (!version) {
    throw new Error('malformed version returned by tbot');
  }
  core.info('detected tbot version: ' + version);

  return version;
}

export async function ensureMinimumVersion(minimumVersion: string) {
  const version = await getVersion();
  if (!semver.gte(version, minimumVersion)) {
    throw new Error(
      `tbot version ${version} detected, minimum version required by this github action is ${minimumVersion}`
    );
  }
}
