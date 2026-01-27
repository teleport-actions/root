import * as core from '@actions/core';

import * as tbot from '@root/lib/tbot';
import * as util from '@root/lib/util';
import { DatabaseTunnel } from '@root/lib/tbot';

const { version } = require('../package.json');

interface Inputs {
  listen: URL;
  timeoutMs: number;
  diagPort: number;

  service: string;
  database: string;
  username: string;
}

function getInputs(): Inputs {
  return {
    listen: util.parseListenURL(
      core.getInput('listen', {
        required: true,
      })
    ),
    timeoutMs: util.parseOptionalInt(
      core.getInput('timeoutMs'),
      tbot.defaultTimeoutMs
    ),
    diagPort: util.parseOptionalInt(
      core.getInput('diagPort'),
      tbot.defaultDiagPort
    ),

    service: core.getInput('service', { required: true }),
    database: core.getInput('database'),
    username: core.getInput('username'),
  };
}

async function run() {
  await tbot.ensureMinimumVersion('18.6.4');

  const inputs = getInputs();
  const sharedInputs = tbot.getSharedInputs();
  const config = tbot.baseConfigurationFromSharedInputs(sharedInputs, false);

  config.services.push({
    type: 'database-tunnel',

    listen: inputs.listen.toString(),
    roles: [], // Use all assigned to bot,

    service: inputs.service,
    database: inputs.database,
    username: inputs.username,
  } satisfies DatabaseTunnel);

  const configPath = await tbot.writeConfiguration(config);
  const env = tbot.baseEnvFromSharedInputs(
    sharedInputs,
    'gha:teleport-actions/database-tunnel',
    version
  );
  await tbot.executeBackground({
    timeoutMs: inputs.timeoutMs,
    diagPort: inputs.diagPort,
    configPath,
    env,
  });

  core.setOutput('database-tunnel-uri', inputs.listen.toString());
  core.setOutput('database-tunnel-port', inputs.listen.port.toString());
}
run().catch(core.setFailed);
