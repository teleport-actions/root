import os from 'os';

import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

function getPlatform(rawPlatform: string): string {
  switch (rawPlatform) {
    case 'linux': {
      return 'linux';
    }
  }
  throw new Error(`platform ${rawPlatform} not supported`);
}

function getArch(rawArch: string): string {
  switch (rawArch) {
    case 'x64': {
      return 'amd64';
    }
    case 'arm': {
      return 'arm';
    }
    case 'arm64': {
      return 'arm64';
    }
  }
  throw new Error(`architecture ${rawArch} not supported`);
}

/**
 * versionString converts a requested version, OS and architecture to a format
 * which can be used to fetch a bundle from the Teleport download site.
 */
function versionString(
  rawPlatform: string,
  rawArch: string,
  version: string
): string {
  const platform = getPlatform(rawPlatform);
  const arch = getArch(rawArch);

  return `v${version}-${platform}-${arch}`;
}

interface Inputs {
  version: string;
}

function getInputs(): Inputs {
  const version = core.getInput('version');
  if (version === '') {
    throw new Error("'version' input must be non-empty");
  }
  if (version.startsWith('v')) {
    throw new Error("'version' input should not be prefixed with 'v'");
  }
  const versionRegex =
    /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?$/i;

  if (!versionRegex.test(version)) {
    throw new Error(
      "incorrect 'version' specified, it should include all parts of the version e.g 11.0.1"
    );
  }

  return {
    version,
  };
}

const toolName = 'teleport';

async function run(): Promise<void> {
  const inputs = getInputs();
  const version = versionString(os.platform(), os.arch(), inputs.version);
  core.info(`Installing Teleport ${version}`);

  const toolPath = tc.find(toolName, version);
  if (toolPath !== '') {
    core.info('Teleport binaries found in cache.');
    core.addPath(toolPath);
    return;
  }

  core.info('Could not find Teleport binaries in cache. Fetching...');
  core.debug('Downloading tar');
  const downloadPath = await tc.downloadTool(
    `https://cdn.teleport.dev/teleport-${version}-bin.tar.gz`
  );

  core.debug('Extracting tar');
  const extractedPath = await tc.extractTar(downloadPath, undefined, [
    'xz',
    '--strip',
    '1',
  ]);

  core.info('Fetched binaries from Teleport. Writing them back to cache...');
  const cachedPath = await tc.cacheDir(extractedPath, toolName, version);
  core.addPath(cachedPath);
}
run().catch(core.setFailed);
