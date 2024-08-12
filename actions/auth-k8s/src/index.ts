import path from 'path';

import * as core from '@actions/core';

import * as tbot from '@root/lib/tbot';
import * as io from '@root/lib/io';
import { DirectoryDestination, KubernetesOutput } from '@root/lib/tbot';

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
  await tbot.ensureMinimumVersion('14.0.0');

  const inputs = getInputs();
  const sharedInputs = tbot.getSharedInputs();
  const config = tbot.baseConfigurationFromSharedInputs(sharedInputs);

  // Inject a destination for the Kubernetes cluster credentials
  const destinationPath = await io.makeTempDirectory();
  const output: KubernetesOutput = {
    type: 'kubernetes',
    destination: <DirectoryDestination>{
      type: 'directory',
      symlinks: 'try-secure',
      path: destinationPath,
    },
    roles: [], // Use all assigned to bot,
    kubernetes_cluster: inputs.kubernetesCluster,
  };
  config.outputs.push(output);

  const configPath = await tbot.writeConfiguration(config);
  const env = tbot.baseEnvFromSharedInputs(
    sharedInputs,
    'gha:teleport-actions/auth-k8s',
    version
  );
  await tbot.execute(configPath, env);

  const identityPath = path.join(destinationPath, 'identity');
  const kubeConfigPath = path.join(destinationPath, 'kubeconfig.yaml');
  core.setOutput('identity-file', identityPath);
  core.setOutput('kubeconfig', kubeConfigPath);

  if (!sharedInputs.disableEnvVars) {
    core.exportVariable('KUBECONFIG', kubeConfigPath);
  }
}
run().catch(core.setFailed);
