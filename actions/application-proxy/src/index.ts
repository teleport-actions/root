import * as core from '@actions/core';

import * as tbot from '@root/lib/tbot';
import * as util from '@root/lib/util';
import { ApplicationProxy } from '@root/lib/tbot';

const { version } = require('../package.json');

interface Inputs {
  listen: URL;
  timeoutMs: number;
  diagPort: number;
}

function getInputs(): Inputs {
  return {
    listen: util.parseListenURL(
      core.getInput('listen', {
        required: true,
      })
    ),
    timeoutMs: util.parseOptionalInt(
      core.getInput('timeout-ms'),
      tbot.defaultTimeoutMs
    ),
    diagPort: util.parseOptionalInt(
      core.getInput('diag-port'),
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
    type: 'application-proxy',
    listen: inputs.listen.toString(),
  } satisfies ApplicationProxy);

  const configPath = await tbot.writeConfiguration(config);

  const env = tbot.baseEnvFromSharedInputs(
    sharedInputs,
    'gha:teleport-actions/application-proxy',
    version
  );
  await tbot.executeBackground({
    timeoutMs: inputs.timeoutMs,
    diagPort: inputs.diagPort,
    configPath,
    env,
  });

  core.setOutput('application-proxy-uri', inputs.listen.toString());
  core.setOutput('application-proxy-port', inputs.listen.port.toString());
}

run().catch(core.setFailed);
