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

# `teleport-actions/application-proxy@v1`

`application-proxy` uses Teleport Machine ID & Workload Identity to spawn a
local HTTP proxy server that tunnels connections to HTTP applications protected
by Teleport. It launches in the background and serves requests to requested
applications for the duration of your job.

Machine & Workload ID's `application-proxy` service can be used to access any
HTTP application (or many applications) granted to the bot via Teleport RBAC
rules. Note that it cannot currently be used to access TCP applications; if you
need to access a TCP app, use the [`application-tunnel`](https://github.com/teleport-actions/application-tunnel)
action instead. To read more about application proxies, refer to
[our documentation](https://goteleport.com/docs/reference/machine-workload-identity/configuration/#application-proxy).

Pre-requisites:

- **Teleport 18.6.4 or above must be used.** Use
  [`teleport-actions/auth-application`](https://github.com/teleport-actions/auth-application/)
  for compatibility with older versions of Teleport.
- Teleport binaries must already be installed in the job environment.
- The Applications you wish to access must already be connected to your Teleport
  cluster. See also:
  <https://goteleport.com/docs/enroll-resources/application-access/getting-started/>
- You must have created a bot with a role with access to your Applications and
  created a GitHub join token that allows that bot to join.
- A Linux based runner.

Example usage:

```yaml
on:
  workflow_dispatch: {}
jobs:
  demo-application-proxy:
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
      - name: Start the application proxy
        uses: teleport-actions/application-proxy@v1
        with:
          # Specify the publicly accessible address of your Teleport proxy; required.
          proxy: tele.example.com:443
          # Specify the name of the join token for your bot; required.
          token: my-github-join-token-name
          # Specify the local listening address for the tunnel; required.
          listen: tcp://localhost:1234

          # Specify an alternative wait timeout. Set to '0' to skip waiting, but
          # note that the tunnel might not be immediately ready for use, and
          # most error detection will be skipped. Optional, defaults to the
          # value below.
          timeoutMs: '30000'
          # Specify an alternative diagnostics port. If running multiple
          # background Teleport actions, you'll need to configure a unique port
          # for each. Optional; defaults to the value below.
          diagPort: '57263'
          # Specify the length of time that the generated credentials should be
          # valid for. Note that background process will automatically refresh
          # its credentials before they expire, so most users should not need to
          # modify this value. Optional, defaults to the value below.
          certificate-ttl: 1h
          # Enable submission of anonymous usage telemetry to Teleport.
          # See https://goteleport.com/docs/machine-id/reference/telemetry/ for
          # more information.
          anonymous-telemetry: 1
      - name: Make request to 'grafana' app
        run: HTTP_PROXY=localhost:1234 curl http://grafana/api/users
```

Note that you must configure the `HTTP_PROXY` in the environment for any future
commands that will access the app in question.

## Troubleshooting

By default, this action waits for the background process (and the app proxy) to
become usable before the job continues to execute future steps. Any errors (e.g.
invalid app name or missing Teleport RBAC permissions) will be shown
immediately.

Logs from the background `tbot` process will be written to the job as part of
the job's "Post Run" step. If you encounter issues, re-run the job in debug mode
and refer to the logs to aid in debugging.

## Outputs

This action will output the following values:

- `application-proxy-uri`: the full URI of the app proxy's listener, e.g.
  `tcp://localhost:1234`
- `application-proxy-port`: the port the app proxy is running on (parsed from
  the URI)
