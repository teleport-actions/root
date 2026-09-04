import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';

import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

const downloadReferer = `https://download.setup.teleport-actions.cdn.teleport.dev`;
const checksumReferer = `https://checksum.setup.teleport-actions.cdn.teleport.dev`;

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
  enterprise: boolean;
  proxyAddr: string;
  cacheEnabled: boolean;
}

function getInputs(): Inputs {
  const version = core.getInput('version');
  if (version === '') {
    throw new Error("'version' input must be non-empty");
  }

  const enterprise = core.getBooleanInput('enterprise');
  const proxyAddr = core.getInput('proxy');

  if (version !== 'auto') {
    if (version.startsWith('v')) {
      throw new Error("'version' input should not be prefixed with 'v'");
    }
    const versionRegex =
      /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?$/i;

    if (!versionRegex.test(version)) {
      throw new Error(
        "incorrect 'version' specified, it should include all parts of the version e.g 11.0.1 or be set to 'auto'"
      );
    }
  } else {
    if (proxyAddr === '') {
      throw new Error(
        "'proxy' input must be non-empty when 'version' is set to 'auto'"
      );
    }
  }

  const cacheEnabled = core.getBooleanInput('cache');

  return {
    version,
    enterprise,
    proxyAddr,
    cacheEnabled,
  };
}

async function fetchVersionFromProxy(proxyAddr: string): Promise<string> {
  const resp = await fetch(`https://${proxyAddr}/webapi/find`);
  const data = await resp.json();
  const version = data?.auto_update?.tools_version;
  if (!version) {
    throw new Error(
      `malformed response from proxy missing version: ${JSON.stringify(data)}`
    );
  }
  return version;
}

async function verifyChecksum(
  archivePath: string,
  checksumUrl: string
): Promise<boolean> {
  const headers = {
    Referer: checksumReferer,
  };
  const checksumPath = await tc.downloadTool(
    checksumUrl,
    undefined,
    undefined,
    headers,
  );
  try {
    const expectedChecksum = (await fs.readFile(checksumPath, 'utf8'))
      .trim()
      .split(/\s+/)[0];
    if (!/^[a-f0-9]{64}$/i.test(expectedChecksum)) {
      throw new Error(
        `malformed Teleport archive checksum from ${checksumUrl}`
      );
    }

    const hash = createHash('sha256');
    for await (const chunk of createReadStream(archivePath)) {
      hash.update(chunk);
    }
    return hash.digest('hex').toLowerCase() === expectedChecksum.toLowerCase();
  } finally {
    await fs.rm(checksumPath, { force: true });
  }
}

async function saveCache(tarPath: string, cacheKey: string): Promise<void> {
  try {
    core.info(`Saving verified cache with key: ${cacheKey}`);
    const cacheId = await cache.saveCache([tarPath], cacheKey);
    if (cacheId === -1) {
      core.debug(`Cache was not saved for the key: ${cacheKey}`);
      return;
    }
    core.info(`Cache saved with the key: ${cacheKey}`);
  } catch (error) {
    core.warning(`Cache save failed: ${(error as Error).message}`);
  }
}

function isGhes(): boolean {
  const ghUrl = new URL(
    process.env['GITHUB_SERVER_URL'] || 'https://github.com'
  );
  const hostname = ghUrl.hostname.trimEnd().toUpperCase();
  const isGitHubHost = hostname === 'GITHUB.COM';
  const isGheCloudHost = hostname.endsWith('.GHE.COM');
  const isLocalHost = hostname.endsWith('.LOCALHOST');
  return !isGitHubHost && !isGheCloudHost && !isLocalHost;
}

function isCacheFeatureAvailable(): boolean {
  if (cache.isFeatureAvailable()) return true;

  if (isGhes()) {
    core.warning(
      'Cache action is only supported on GHES version >= 3.5. If you are on version >=3.5 Please check with GHES admin if Actions cache service is enabled or not.'
    );
    return false;
  }

  core.warning(
    'The runner was not able to contact the cache service. Caching will be skipped'
  );
  return false;
}

async function run(): Promise<void> {
  const inputs = getInputs();
  core.setOutput('cache-hit', false);

  if (inputs.version === 'auto') {
    core.info(`Fetching version from proxy: ${inputs.proxyAddr}`);
    const proxyVersion = await fetchVersionFromProxy(inputs.proxyAddr);
    core.info(`Fetched version: ${proxyVersion}`);
    inputs.version = proxyVersion;
  }

  const version = versionString(os.platform(), os.arch(), inputs.version);
  const toolName = inputs.enterprise ? 'teleport-ent' : 'teleport';
  core.info(`Installing ${toolName} ${version}`);

  // Check tool cache first (local to the runner)
  const toolPath = tc.find(toolName, version);
  if (toolPath !== '') {
    core.info('Teleport binaries found in tool cache.');
    core.addPath(toolPath);
    return;
  }

  const cachingActive = inputs.cacheEnabled && isCacheFeatureAvailable();
  const archiveUrl = `https://cdn.teleport.dev/${toolName}-${version}-bin.tar.gz`;
  const checksumUrl = `${archiveUrl}.sha256`;
  const runnerTemp = process.env['RUNNER_TEMP'] || os.tmpdir();
  const cacheKey = `teleport-setup-${toolName}-${version}`;
  const headers = {
    Referer: downloadReferer,
  };

  // The original compressed archive is cached outside GITHUB_WORKSPACE so it
  // never appears in the checked-out repository.
  const tarPath = path.join(
    runnerTemp,
    '.teleport-setup-cache',
    `${toolName}-${version}.tar.gz`
  );

  // Try GitHub Cache (shared between runs)
  let cacheEntryWasCorrupt = false;
  if (cachingActive) {
    try {
      core.info('Attempting to restore from GitHub Actions cache...');
      await fs.mkdir(path.dirname(tarPath), { recursive: true });
      const matchedKey = await cache.restoreCache([tarPath], cacheKey);
      if (matchedKey) {
        if (await verifyChecksum(tarPath, checksumUrl)) {
          core.info(`Verified cache restored from key: ${matchedKey}`);
          const extractedPath = await tc.extractTar(tarPath, undefined, [
            'xz',
            '--strip',
            '1',
          ]);
          const cachedPath = await tc.cacheDir(
            extractedPath,
            toolName,
            version
          );
          core.setOutput('cache-hit', true);
          core.addPath(cachedPath);
          return;
        }

        cacheEntryWasCorrupt = true;
        core.warning(
          `Restored cache checksum did not match for key ${cacheKey}. Discarding it.`
        );
        await fs.rm(tarPath, { force: true });
      }
      core.info('GitHub Actions cache miss.');
    } catch (error) {
      core.warning(
        `Cache restore failed, falling back to download: ${
          (error as Error).message
        }`
      );
    }
  }

  core.info('Could not find Teleport binaries in cache. Fetching...');
  core.debug('Downloading tar');
  const downloadPath = await tc.downloadTool(archiveUrl, undefined, undefined, headers);

  if (!(await verifyChecksum(downloadPath, checksumUrl))) {
    await fs.rm(downloadPath, { force: true });
    throw new Error('Downloaded Teleport archive checksum did not match.');
  }
  core.info('Downloaded Teleport archive checksum verified.');

  let tarballPath = downloadPath;
  if (cachingActive) {
    await fs.mkdir(path.dirname(tarPath), { recursive: true });
    await fs.rename(downloadPath, tarPath);
    tarballPath = tarPath;
  }

  core.debug('Extracting tar');
  const extractedPath = await tc.extractTar(tarballPath, undefined, [
    'xz',
    '--strip',
    '1',
  ]);
  const cachedPath = await tc.cacheDir(extractedPath, toolName, version);
  core.addPath(cachedPath);

  if (cachingActive && !cacheEntryWasCorrupt) {
    // A failed cache upload must not make an otherwise successful setup fail.
    process.on('uncaughtException', error => {
      core.warning(`Cache save failed: ${error.message}`);
    });
    await saveCache(tarPath, cacheKey);
  }
}
run()
  .catch(core.setFailed)
  .finally(() => process.exit());
