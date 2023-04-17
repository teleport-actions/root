import path from 'path';

import * as core from '@actions/core';

import * as tbot from '@root/lib/tbot';
import * as io from '@root/lib/io';

const { version } = require('../package.json');

async function run() {
  const sharedInputs = tbot.getSharedInputs();
  const config = tbot.baseConfigurationFromSharedInputs(sharedInputs);

  const destinationPath = await io.makeTempDirectory();
  config.destinations.push({
    directory: {
      path: destinationPath,
      symlinks: "try-secure",
    },
    roles: [], // Use all assigned to bot,
  });

  const configPath = await tbot.writeConfiguration(config);
  const env = tbot.baseEnvFromSharedInputs(
    sharedInputs,
    'gha:teleport-actions/auth',
    version
  );
  await tbot.execute(configPath, env);

  const identityFilePath = path.join(destinationPath, 'identity');
  const sshConfigFilePath = path.join(destinationPath, 'ssh_config');
  core.setOutput('identity-file', identityFilePath);
  core.setOutput('ssh-config', sshConfigFilePath);
  core.exportVariable('TELEPORT_PROXY', sharedInputs.proxy);
  core.exportVariable('TELEPORT_AUTH_SERVER', sharedInputs.proxy);
  core.exportVariable('TELEPORT_IDENTITY_FILE', identityFilePath);
}
run().catch(core.setFailed);
