[![CI](https://github.com/cloudydeno/kubernetes-client/actions/workflows/deno-ci.yaml/badge.svg)](https://github.com/cloudydeno/kubernetes-client/actions/workflows/deno-ci.yaml)

# `jsr:@cloudydeno/kubernetes-client`

This module implements several ways of sending authenticated requests
to the Kubernetes API from Deno programs.

Kubernetes is a complex architechure which likes using sophisticated networking concepts,
while Deno is a younger runtime, so there's some mismatch in capabilities.
Deno also has a granular permission system controlling what a program can access.
Therefore different Deno flags can be given to your program depending on where you are running it.

## Usage

Here's a basic request, listing all Pods in the `default` namespace.
It uses the `autoDetectClient()` entrypoint which returns the first usable client.

Note: The below example shows a manual HTTP request.
This library is intended as a building block for issuing raw HTTP requests.
To use the Kubernetes APIs more easily, consider also using
[@cloudydeno/kubernetes-apis](https://jsr.io/@cloudydeno/kubernetes-apis).

```ts
import { autoDetectClient } from 'https://deno.land/x/kubernetes_client/mod.ts';
const kubernetes = await autoDetectClient();

const podList = await kubernetes.performRequest({
  method: 'GET',
  path: `/api/v1/namespaces/default/pods`,
  expectJson: true, // run JSON.parse on the response body
});
console.log(podList);

// see demo.ts for more request examples (streaming responses, etc)
```

## Client Implementations

The available clients are:

1. `InCluster` which uses the current pod's service account to talk to the control plane.
    Use with Deno flags: `--allow-read=/var/run/secrets/kubernetes.io --allow-net=kubernetes.default.svc.cluster.local`

1. `KubectlRaw` which will run individual `kubectl` commands to send requests to Kubernetes.
    This can be helpful when connecting to a cluster from a laptop.
    Authentication won't be a problem since `kubectl` already handles all of that.
    Use with Deno flag `--allow-run=kubectl` to authorize this client.

1. `KubeConfig` which reads your `~/.kube/config` file and attempts to connect to the current default cluster.
    Usually this works, but it might not always. Some of the issues would be fixable given a bug report.
    You'll probably want to pass at least  `--allow-env --allow-net --allow-read=$HOME/.kube` to Deno.

1. `KubectlProxy` which simply sends HTTP requests to `http://localhost:8081`.
    You'll need to first launch `kubectl proxy` in a separate terminal/shell and leave it running.
    Use with Deno flag `--allow-net=localhost:8001` to authorize this client.

An error message is shown when no client is usable, something like this:

```
Error: Failed to load any possible Kubernetes clients:
  - InCluster PermissionDenied: Requires read access to "/var/run/secrets/kubernetes.io/serviceaccount/namespace", run again with the --allow-read flag
  - KubeConfig PermissionDenied: Requires env access to "KUBECONFIG", run again with the --allow-env flag
  - KubectlProxy PermissionDenied: Requires net access to "localhost:8001", run again with the --allow-net flag
  - KubectlRaw PermissionDenied: Requires run access to "kubectl", run again with the --allow-run flag
```

## Programmatic API

You can also directly instantiate a particular client if you don't want to depend on autodetection.

* `KubectlRawRestClient` invokes `kubectl --raw` for every HTTP call.
    Dependable for development, though several methods are not available due to kubectl limitations.

* `KubeConfigRestClient` uses `fetch()` to issue HTTP requests. There's a few different functions to configure it:

    * `forInCluster()` uses a pod's ServiceAccount to automatically authenticate.

    * `forKubectlProxy()` expects a `kubectl proxy` command to be runnin. This allows a full range-of-motion for development purposes regardless of the Kubernetes configuration.

    * `readKubeConfig(path?, context?)` (or `forKubeConfig(config, context?)`) tries using the given config (or `$HOME/.kube/config` if none is given) as faithfully as possible. Passing a context name will override the `current-context` value from your config file.

## Development

Check out `lib/contract.ts` to see the type/API contract.

The `kubectl` client logs the issued commands if `--verbose` is passed to the Deno program.

If you are unsure how to issue a specific request from your own library/code,
or if your usage results in any `TODO: ...` error message from my code,
please feel free to file a Github Issue.

## Changelog

* `v0.7.0` on `2023-08-13`:
    Port `KubectlRawRestClient` over to newer `Deno.Command()` API.
    Support patching subresources & opening PodExec tunnels in `KubectlRawRestClient`.
    Obey `abortSignal` in more places (WebSocket tunnels, `kubectl` invocations).
    New API for swapping out the `KubeConfigRestClient` when auto-detecting a client.

    * `v0.7.1` on `2023-09-24`: Update std dependencies to `/std@0.202.0`
    * `v0.7.2` on `2023-12-29`: Fix `WebsocketTunnel` for Deno v1.38 change
    * `v0.7.3` on `2024-09-10`: Drop support for Deno v1.40 and earlier.
    * `v0.7.4` on `2025-04-23`: Add support for relative paths in Kubeconfig (#24, thanks!)
    * `v0.7.5` on `2025-05-22`: More `abortSignal`, make RestClients closable
    * `v0.7.6` on `2025-09-18`: Drop `/x/` publication, now JSR-only
    * `v0.7.7` on `2025-09-19`: Update docs, target only Deno v2, add v5.channel.k8s.io

* `v0.6.0` on `2023-08-08`:
    Introduce an API for opening Kubernetes tunnels, useful for `PodExec` and others.
    Add an initial WebSocket-based tunnel client (in beta).

* `v0.5.2` on `2023-06-12`:
    Remove IP address restriction. Deno v1.33.4 can now access IP addresses with TLS.
    This is important when accessing GKE clusters or similar configurations.

* `v0.5.1` on `2023-05-09`:
    Run CI on Deno v1.26 thru v1.32.
    Now supports 'exec' plugins in kubeconfigs to load temporary credentials.
    This new feature requires Deno v1.31 or later (or Deno v1.28 with --unstable).

* `v0.5.0` on `2023-02-09`:
    Updated deps to `/std@0.177.0` and run CI on Deno v1.22 thru v1.30.
    Now skips interactive permission prompts for InCluster files.
    Now throws an error when expectStream requests do not succeed.
    Authenticating with mTLS now requires Deno v1.15 or later.

* `v0.4.0` on `2022-05-21`:
    Updated deps to `/std@0.140.0`.
    Now requires Deno v1.14 or later to pass typecheck.

* `v0.3.2` on `2021-11-28`:
    Fix another regression on modern Deno, related to client certificates.
    Or more exactly the lack thereof when running in-cluster.

* `v0.3.1` on `2021-11-27`:
    Fix cluster certificate authority setup in `KubeConfigRestClient`
    on [Deno v1.15.0 and later](https://deno.com/blog/v1.15#in-memory-ca-certificates).

* `v0.3.0` on `2021-08-29`:
    Allow TLS authentication, when supported by Deno ([#7](https://github.com/cloudydeno/deno-kubernetes_client/issues/7)).
    More consistently use `--verbose` flag ([#4](https://github.com/cloudydeno/deno-kubernetes_client/issues/4)).
    Updated deps to `/std@0.105.0`.
    Now requires Deno v1.11 or later.

* `v0.2.4` on `2021-05-09`: Clean up Deno-specific code in `stream-transformers.ts`.
    This also improves compatibility with Deno Deploy.
    Updated deps to `/std@0.95.0`.

* `v0.2.3` on `2021-04-26`: Full fix for certificate data encodings.
    Addresses a partial fix in `v0.2.3` which introduced an InCluster regression.

* `v0.2.2` on `2021-04-21`: Fix for using certificate data stored within kubeconfig.
    The Base64 encoding was not being respected previously.

* `v0.2.1` on `2021-03-26`: Better Windows support from @jhannes.
    Checks for the `$USERPROFILE` variable as well as `$HOME`.

* `v0.2.0` on `2021-02-27`: Rewrote KubeConfig handling and removed stable/unstable split.
    There's only two transport implementations now: KubectlRaw and KubeConfig.

* `v0.1.3` on `2020-12-29`: Improved `KubectlRaw` Patch support.
    Now supports namespaced resources ;) and knows that subresources can't be patched.

* `v0.1.2` on `2020-12-27`: Initial `KubectlRaw` Patch support.
    Also exports the `Reflector` implementation and plumbs the unstable `Kubeconfig` client more.

* `v0.1.1` on `2020-12-24`: Add a generic Reflector implementation.
    This is useful for consuming a pairing of list & watch APIs.

* `v0.1.0` on `2020-11-16`: Initial publication, with `KubectlRaw` and `InCluster` clients.
    Also includes `ReadableStream` transformers, useful for consuming watch streams.

## Related: API Typings

This module is only implementing the HTTP/transport part of talking to Kubernetes.
You'll likely also want Typescript interfaces around actually working with Kubernetes resources.

API typings are available in a sibling project:
[kubernetes-apis](https://github.com/danopia/kubernetes-apis)
published to
[@cloudydeno/kubernetes-apis](https://jsr.io/@cloudydeno/kubernetes-apis).

Of course, for some situations it might make sense to issue specific requests directly
in which case using this client library alone might make more sense.

## TODO
* [x] Support for `kubectl proxy`
* [ ] Add filtering to Reflector implementation (e.g. by annotation)
