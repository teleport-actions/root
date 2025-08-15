import path from 'path';

import * as core from '@actions/core';

import * as tbot from '@root/lib/tbot';
import * as io from '@root/lib/io';
import { ApplicationOutput, DirectoryDestination } from '@root/lib/tbot';

const { version } = require('../package.json');

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
  await tbot.ensureMinimumVersion('16.0.0');

  const inputs = getInputs();
  const sharedInputs = tbot.getSharedInputs();
  const config = tbot.baseConfigurationFromSharedInputs(sharedInputs);

  // Inject a destination for the Application Access credentials
  const destinationPath = await io.makeTempDirectory();
  const output: ApplicationOutput = {
    type: 'application',
    destination: <DirectoryDestination>{
      type: 'directory',
      symlinks: 'try-secure',
      path: destinationPath,
    },
    roles: [], // Use all assigned to bot,
    app_name: inputs.app,
  };
  config.outputs.push(output);

  const configPath = await tbot.writeConfiguration(config);
  const env = tbot.baseEnvFromSharedInputs(
    sharedInputs,
    'gha:teleport-actions/auth-application',
    version
  );
  await tbot.execute(configPath, env);

  core.setOutput('destination-dir', destinationPath);
  core.setOutput('identity-file', path.join(destinationPath, 'identity'));
  core.setOutput('certificate-file', path.join(destinationPath, 'tlscert'));
  core.setOutput('key-file', path.join(destinationPath, 'key'));
}
run().catch(core.setFailed);
