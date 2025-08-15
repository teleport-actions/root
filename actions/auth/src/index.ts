import path from 'path';

import * as core from '@actions/core';

import * as tbot from '@root/lib/tbot';
import * as io from '@root/lib/io';
import { DirectoryDestination, IdentityOutput } from '@root/lib/tbot';

const { version } = require('../package.json');

interface Inputs {
  allowReissue: boolean;
}

function getInputs(): Inputs {
  return {
    allowReissue: core.getBooleanInput('allow-reissue'),
  };
}

async function run() {
  await tbot.ensureMinimumVersion('16.0.0');

  const sharedInputs = tbot.getSharedInputs();
  const inputs = getInputs();
  const config = tbot.baseConfigurationFromSharedInputs(sharedInputs);

  const destinationPath = await io.makeTempDirectory();
  const output: IdentityOutput = {
    type: 'identity',
    destination: <DirectoryDestination>{
      type: 'directory',
      symlinks: 'try-secure',
      path: destinationPath,
    },
    roles: [], // Use all assigned to bot,
  };
  // We only set `allow_reissue` to an explicit value if the input is set to
  // true. This is because only tbot 17.2.9 and later supports this field, and,
  // explicitly setting the field to false would cause older tbot versions to
  // fail to parse. At a later date, we could remove this check and explicitly
  // set the value to true. Consider this from the v19 release onwards.
  if (inputs.allowReissue) {
    output.allow_reissue = true;
  }
  config.outputs.push(output);

  const configPath = await tbot.writeConfiguration(config);
  const env = tbot.baseEnvFromSharedInputs(
    sharedInputs,
    'gha:teleport-actions/auth',
    version
  );
  await tbot.execute(configPath, env);

  const identityFilePath = path.join(destinationPath, 'identity');
  const sshConfigFilePath = path.join(destinationPath, 'ssh_config');
  core.setOutput('destination-dir', destinationPath);
  core.setOutput('identity-file', identityFilePath);
  core.setOutput('ssh-config', sshConfigFilePath);

  if (!sharedInputs.disableEnvVars) {
    core.exportVariable('TELEPORT_PROXY', sharedInputs.proxy);
    core.exportVariable('TELEPORT_AUTH_SERVER', sharedInputs.proxy);
    core.exportVariable('TELEPORT_IDENTITY_FILE', identityFilePath);
  }
}
run().catch(core.setFailed);
