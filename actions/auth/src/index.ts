import path from 'path';

import * as core from '@actions/core';

import * as tbot from '@root/lib/tbot';
import * as io from '@root/lib/io';

async function run() {
  const sharedInputs = tbot.getSharedInputs();
  const config = tbot.baseConfigurationFromSharedInputs(sharedInputs);

  const destinationPath = await io.makeTempDirectory();
  config.destinations.push({
    directory: {
      path: destinationPath,
    },
    roles: [], // Use all assigned to bot,
  });

  const configPath = await tbot.writeConfiguration(config);
  await tbot.execute(configPath);

  const identityFilePath = path.join(destinationPath, 'identity');
  const sshConfigFilePath = path.join(destinationPath, 'ssh_config');
  core.setOutput('identity-file', identityFilePath);
  core.setOutput('ssh-config', sshConfigFilePath);
  core.exportVariable('TELEPORT_PROXY', sharedInputs.proxy);
  core.exportVariable('TELEPORT_AUTH_SERVER', sharedInputs.proxy);
  core.exportVariable('TELEPORT_IDENTITY_FILE', identityFilePath);
}
run().catch(core.setFailed);
