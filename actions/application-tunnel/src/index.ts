import * as core from '@actions/core';

import * as tbot from '@root/lib/tbot';
import * as util from '@root/lib/util';
import { ApplicationTunnel } from '@root/lib/tbot';

const { version } = require('../package.json');

interface Inputs {
  app: string;
  listen: URL;
  timeoutMs: number;
  diagPort: number;
}

function getInputs(): Inputs {
  return {
    app: core.getInput('app', {
      required: true,
    }),
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
  };
}

async function run() {
  await tbot.ensureMinimumVersion('18.6.4');

  const inputs = getInputs();
  const sharedInputs = tbot.getSharedInputs();
  const config = tbot.baseConfigurationFromSharedInputs(sharedInputs, false);

  config.services.push({
    type: 'application-tunnel',

    roles: [], // Use all assigned to bot,
    app_name: inputs.app,
    listen: inputs.listen.toString(),
  } satisfies ApplicationTunnel);

  const configPath = await tbot.writeConfiguration(config);
  const env = tbot.baseEnvFromSharedInputs(
    sharedInputs,
    'gha:teleport-actions/application-tunnel',
    version
  );
  await tbot.executeBackground({
    timeoutMs: inputs.timeoutMs,
    diagPort: inputs.diagPort,
    configPath,
    env,
  });

  core.setOutput('application-tunnel-uri', inputs.listen.toString());
  core.setOutput('application-tunnel-port', inputs.listen.port.toString());
}

run().catch(core.setFailed);
