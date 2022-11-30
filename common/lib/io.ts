import * as path from 'path';
import { randomUUID } from 'crypto';
import { platform } from 'os';

import * as io from '@actions/io';

export async function makeTempDirectory(): Promise<string> {
  // TODO(strideynet): make all of this work with Mac/Windows runners
  if (platform() !== 'linux') {
    throw new Error('this action is currently only supported on Linux runners');
  }

  let basePath = process.env['RUNNER_TEMP'];
  if (!basePath) {
    basePath = path.join('/home', 'actions', 'temp');
  }

  const newPath = path.join(basePath, randomUUID());
  await io.mkdirP(newPath);
  return newPath;
}
