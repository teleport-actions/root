import path from 'path';

import * as core from '@actions/core';

import * as tbot from '@root/lib/tbot';
import * as io from '@root/lib/io';

const { version } = require('../package.json');

interface Inputs {
  kubernetesCluster: string;
}

function getInputs(): Inputs {
  return {
    kubernetesCluster: core.getInput('kubernetes-cluster', {
      required: true,
    }),
  };
}

async function run() {
  const inputs = getInputs();
  const sharedInputs = tbot.getSharedInputs();
  const config = tbot.baseConfigurationFromSharedInputs(sharedInputs);

  // Inject a destination for the Kubernetes cluster credentials
  const destinationPath = await io.makeTempDirectory();
  config.destinations.push({
    directory: {
      path: destinationPath,
      symlinks: 'try-secure',
    },
    roles: [], // Use all assigned to bot,
    kubernetes_cluster: inputs.kubernetesCluster,
  });

  const configPath = await tbot.writeConfiguration(config);
  const env = tbot.baseEnvFromSharedInputs(
    sharedInputs,
    'gha:teleport-actions/auth-k8s',
    version
  );
  await tbot.execute(configPath, env);

  core.exportVariable(
    'KUBECONFIG',
    path.join(destinationPath, '/kubeconfig.yaml')
  );
}
run().catch(core.setFailed);
