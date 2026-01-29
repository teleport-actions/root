<div align="center">
   <img src="https://github.com/gravitational/teleport-actions/raw/main/assets/img/readme-header.png" width=750/>
   <div align="center" style="padding: 25px">
      <a href="https://www.apache.org/licenses/LICENSE-2.0">
      <img src="https://img.shields.io/badge/Apache-2.0-red.svg" />
      </a>
   </div>
</div>
</br>

> Read our Blog: <https://goteleport.com/blog/>

> Read our Documentation: <https://goteleport.com/docs/getting-started/>

# `teleport-actions/database-tunnel@v1`

`database-tunnel` uses Teleport Machine & Workload ID to open a local tunnel to
a database protected by Teleport. It launches in the background and tunnels
requests to the target database for the duration of your job.

Pre-requisites:

- **Teleport 18.6.4 or above must be used.** For older versions, refer to the
  manual configuration steps [in our documentation][manual].
- Teleport binaries must already be installed in the job environment.
- The Database you wish to access must already be connected to your Teleport
  cluster. See also:
  <https://goteleport.com/docs/enroll-resources/database-access/getting-started/>
- You must have created a bot with a role with access to your Database and
  created a GitHub join token that allows that bot to join.
- A Linux based runner.

[manual]: https://goteleport.com/docs/machine-workload-identity/deployment/github-actions/#example-manual-configuration

Example usage:

```yaml
on:
  workflow_dispatch: {}
jobs:
  demo-database-tunnel:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - name: Install Teleport
        uses: teleport-actions/setup@v1
        with:
          # specify version as "auto" and provide the address of your Teleport
          # proxy using the "proxy" input.
          version: auto
          proxy: tele.example.com:443
      - name: Start a database tunnel
        uses: teleport-actions/database-tunnel@v1
        with:
          # Specify the publicly accessible address of your Teleport proxy;
          # required.
          proxy: tele.example.com:443
          # Specify the name of the join token for your bot; required.
          token: my-github-join-token-name
          # Specify the local listening address for the tunnel; required.
          listen: tcp://localhost:1234
          # Specify the name of the database server as it exists in Teleport;
          # required.
          service: postgres
          # Specify the name of the database as it exists within the target
          # database server. Required for most database types.
          database: example
          # Specify the username that should access the database, if any.
          username: example

          # Specify an alternative wait timeout. Set to '0' to skip waiting, but
          # note that the tunnel might not be immediately ready for use, and
          # most error detection will be skipped. Optional, defaults to the
          # value below.
          timeout-ms: '30000'
          # Specify an alternative diagnostics port. If running multiple
          # background Teleport actions, you'll need to configure a unique port
          # for each. Optional; defaults to the value below.
          diag-port: '57263'
          # Specify the length of time that the generated credentials should be
          # valid for. Note that background process will automatically refresh
          # its credentials before they expire, so most users should not need to
          # modify this value. Optional, defaults to the value below.
          certificate-ttl: 1h
          # Enable submission of anonymous usage telemetry to Teleport.
          # See https://goteleport.com/docs/machine-id/reference/telemetry/ for
          # more information.
          anonymous-telemetry: 1
      - name: Connect to the database through the open tunnel
        run: psql postgres://demo@localhost:1234/example -c 'select version();'
```

## Troubleshooting

By default, this action waits for the background process (and the database
proxy) to become usable before the job continues to execute future steps. Any
errors (e.g. invalid database name or missing Teleport RBAC permissions) will be
shown immediately.

Logs from the background `tbot` process will be written to the job as part of
the job's "Post Run" step. If you encounter issues, re-run the job in debug mode
and refer to the logs to aid in debugging.

## Outputs

This action will output the following values:

- `database-tunnel-uri`: the listener URI as specified in the `listen` field
- `database-tunnel-port`: the listener port, parsed from the `listen` field
