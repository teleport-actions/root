import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';
import * as timers from 'timers/promises';

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as yaml from 'yaml';
import * as semver from 'semver';

import * as io from './io';

/**
 * The default port for the diagnostic service, used for background actions.
 */
export const defaultDiagPort = 57263;

/**
 * The default timeout for background actions if readiness checks are enabled.
 */
export const defaultTimeoutMs = 30000;

const stateLogPath = "log-path";

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
  allow_reissue?: boolean;
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

export interface ApplicationProxy {
  type: 'application-proxy';

  listen: string;

  // App proxies don't support roles, and don't require an app name.
}

export interface ApplicationTunnel {
  type: 'application-tunnel';

  listen: string;
  roles: Array<string>;

  app_name: string;
}

export interface DatabaseTunnel {
  type: 'database-tunnel';

  listen: string;
  roles: Array<string>;

  service: string;
  database: string;
  username: string;
}

export type Output = IdentityOutput | KubernetesOutput | ApplicationOutput;

// Technically the two fields are interchangeable, but we'll put the new service
// types under the new field.
export type Service = ApplicationProxy | ApplicationTunnel | DatabaseTunnel;

export interface Configuration {
  version: 'v2';
  proxy_server?: string;
  auth_server?: string;
  oneshot: boolean;
  certificate_ttl?: string;
  onboarding: {
    join_method: string;
    token: string;
    ca_pins: string[];
  };
  storage: Destination;
  outputs: Array<Output>;
  services: Array<Service>;
}

export function baseConfigurationFromSharedInputs(
  inputs: SharedInputs,
  oneshot = true,
): Configuration {
  const storage: MemoryDestination = {
    type: 'memory',
  };
  const cfg: Configuration = {
    version: 'v2',
    proxy_server: inputs.proxy,
    oneshot,
    onboarding: {
      join_method: 'github',
      token: inputs.token,
      ca_pins: inputs.caPins,
    },
    storage: storage,
    outputs: [],
    services: [],
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

export interface ExecuteBackgroundParams {
  configPath: string,
  env: { [key: string]: string },

  /**
   * If unspecified, start the diag service on the given port. If unset, a
   * default port will be used.
   */
  diagPort?: number;

  /**
   * If set, polls the diagnostics endpoint to wait for readiness before
   * detaching. If the specified time elapses before tbot reports ready, the
   * action fails. If unset, the action detaches the child immediately,
   * potentially before it is ready.
   */
  timeoutMs?: number;
}

export async function executeBackground({
  configPath,
  env,
  timeoutMs,
  diagPort = defaultDiagPort,
}: ExecuteBackgroundParams) {
  const args = ['start', '-c', configPath];
  if (core.isDebug()) {
    args.push('--debug');
  }

  const diagAddr = `127.0.0.1:${diagPort}`;
  core.setOutput("diag-addr", diagAddr);
  args.push("--diag-addr", diagAddr);

  core.info(`Invoking tbot with configuration ${configPath} and args: ${args}`);

  // Open a log file to store bot log output. Save it both as output (for end
  // users, if they want it for whatever reason), and for the post step.
  const uuid = crypto.randomUUID();
  const logPath = path.join(os.tmpdir(), `tbot-${uuid}.log`);
  core.setOutput(stateLogPath, logPath);
  core.saveState(stateLogPath, logPath);

  const logHandle = await fs.open(logPath, 'a')

  const child = child_process.spawn("tbot", args, {
    detached: true,
    stdio: ['ignore', logHandle.fd, logHandle.fd],
    env,
  });

  if (timeoutMs) {
    try {
      const start = performance.now();
      await waitForBackgroundReadiness(timeoutMs, diagAddr, child);

      const end = performance.now();
      core.info(`tbot became ready in ${end - start}ms`);
    } catch (err: any) {
      // On error, log it and dump the logs now. We won't be passing the log
      // path back up so the caller won't be able to do this itself.
      core.error(`tbot failed to become ready (${err}), examine the following log for details`);

      // This dumps logs redundantly, but it's arguably more obvious to users
      // given the explicit failure condition than making them have to look at
      // the post step output.
      await dumpLogs(logPath);

      // Re-throw the error.
      throw err;
    }
  } else {
    core.warning('a wait timeout of 0 was specified (via the `timeoutMs` field), the bot may not be ready to service requests')
  }

  child.unref();
}

/**
 * Reads tbot logs from the given path and writes them to stdout. If no path is
 * provided, the path will be retrieved from the action state.
 * @param path the log path to dump
 */
export async function dumpLogs(path?: string) {
  if (!path) {
    path = core.getState(stateLogPath);
  }

  if (!path) {
    throw new Error('a log path must either be provided or stored in the action state');
  }

  // Re-capture variable to please tsc.
  const logPath = path;

  await core.group('tbot output', async () => {
    try {
      const content = await fs.readFile(logPath, 'utf-8')
      process.stdout.write(content);
    } catch (err) {
      core.error(`Could not retrieve tbot logs: ${err}`);
    }
  });
}

export async function waitForBackgroundReadiness(
  timeoutMs: number,
  diagAddr: string,
  child: child_process.ChildProcess,
) {
  let exitListener: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;

  // We'll spawn a few promises to race. First, raise an error after the given
  // timeout.
  const controller = new AbortController();
  const timeout = (async () => {
    await timers.setTimeout(timeoutMs, undefined, { signal: controller.signal });
    throw new Error(`timed out after ${timeoutMs}ms`);
  })().catch((err) => {
    // Ignore abort errors if cancelled.
    if (err.name === 'AbortError') {
      return;
    }

    throw err;
  });

  // Next, wait for the child to exit and raise an error if it exits while we're
  // still waiting.
  const childExit: Promise<void> = new Promise((_, reject) => {
    exitListener = (code, signal) => {
      reject(new Error(`tbot exited prematurely (code=${code}, signal=${signal})`));
    };

    child.once('exit', exitListener);
  });

  // Finally, poll the /wait endpoint. (Ideally, this succeeds before the others
  // fail.)
  const waiter = (async () => {
    while (!controller.signal.aborted) {
      try {
        const result = await fetch(`http://${diagAddr}/wait`);
        if (result.ok) {
          return;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;
        }

        // Ignore all other errors. Requests are expectedto  fail if the bot
        // hasn't started yet (I/O error), or if reports unhealthy (503).
      }

      try {
        await timers.setTimeout(250, undefined, { signal: controller.signal });
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;
        }
      }
    }
  })();

   try {
    await Promise.race([timeout, childExit, waiter]);
  } finally {
    // Abort any remaining promises.
    controller.abort();

    // Also remove the event listener.
    if (exitListener !== undefined) {
      child.off('exit', exitListener)
    }
  }
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
