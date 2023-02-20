import path from 'path';

import * as core from '@actions/core';

import * as tbot from '@root/lib/tbot';
import * as io from '@root/lib/io';

interface Inputs {
  app: string;
}

function getInputs(): Inputs {
  return {
    app: core.getInput('app', {
      required: true,
    }),
  };
}

async function run() {
  const inputs = getInputs();
  const sharedInputs = tbot.getSharedInputs();
  const config = tbot.baseConfigurationFromSharedInputs(sharedInputs);

  // Inject a destination for the Application Access credentials
  const destinationPath = await io.makeTempDirectory();
  config.destinations.push({
    directory: {
      path: destinationPath,
    },
    roles: [], // Use all assigned to bot,
    app: inputs.app,
  });

  const configPath = await tbot.writeConfiguration(config);
  await tbot.execute(configPath);

  core.setOutput('certificate-file', path.join(destinationPath, 'tlscert'));
  core.setOutput('key-file', path.join(destinationPath, 'key'));
}
run().catch(core.setFailed);