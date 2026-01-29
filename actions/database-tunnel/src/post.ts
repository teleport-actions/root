import * as core from '@actions/core';

import * as tbot from '@root/lib/tbot';

async function run() {
  tbot.dumpLogs();
}

run().catch(core.setFailed);
