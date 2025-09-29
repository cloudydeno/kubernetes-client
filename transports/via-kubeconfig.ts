import { TextLineStream } from '@std/streams/text-line-stream';

import type { RestClient, RequestOptions, JSONValue, KubernetesTunnel } from '../lib/contract.ts';
import { JsonParsingTransformer } from '../lib/stream-transformers.ts';
import { createConfigFromEnvironment, createConfigFromPath, createInClusterConfig, createSimpleUrlConfig } from "../lib/kubeconfig/create.ts";
import type { KubeConfigContext } from "../lib/kubeconfig/context.ts";
import type { KubeConfig } from "../lib/kubeconfig/config.ts";

const isVerbose = Deno.args.includes('--verbose');

/**
 * A RestClient which uses a KubeConfig to talk directly to a Kubernetes endpoint.
 * Used by code which is running within a Kubernetes pod and would like to
 * access the local cluster's control plane using its Service Account.
 *
 * Also useful for some development workflows,
 * such as interacting with `kubectl proxy` or even directly in certain cases.
 * Unfortunately Deno's fetch() is still a bit gimped for server use
 * so this client works best for simple cases.
 *
 * Deno flags to use this client:
 * Basic KubeConfig: --allow-read=$HOME/.kube --allow-net --allow-env
 * In-cluster: --allow-read=/var/run/secrets/kubernetes.io --allow-net
 *
 * Unstable features:
 * - using client auth authentication, if configured
 * - inspecting permissions and prompting for further permissions (TODO)
 *
 * --allow-env is purely to read the $HOME and $KUBECONFIG variables to find your kubeconfig
 *
 * Note that advanced kubeconfigs will need different permissions.
 * This client will prompt you if your config requires extra permissions.
 * Federated auth like AWS IAM or a Google Account are the largest offenders.
 *
 * Note that KUBERNETES_SERVER_HOST is not used for historical reasons.
 * TODO: This variable could be used for an optimization, when available.
 */

export class KubeConfigRestClient implements RestClient, Disposable {
  constructor(
    protected ctx: KubeConfigContext,
    protected httpClient: Deno.HttpClient | null,
  ) {
    this.defaultNamespace = ctx.defaultNamespace || 'default';
  }
  defaultNamespace?: string;

  static async forInCluster(): Promise<RestClient> {
    return await this.forKubeConfig(
      await createInClusterConfig());
  }

  static async forKubectlProxy(): Promise<RestClient> {
    return await this.forKubeConfig(
      createSimpleUrlConfig('http://localhost:8001'));
  }

  static async readKubeConfig(
    path?: string,
    contextName?: string,
  ): Promise<RestClient> {
    return this.forKubeConfig(path
      ? await createConfigFromPath(path)
      : await createConfigFromEnvironment(), contextName);
  }

  static async forKubeConfig(
    config: KubeConfig,
    contextName?: string,
  ): Promise<RestClient> {
    const ctx = config.fetchContext(contextName);
    return await this.forKubeConfigContext(ctx);
  }

  static async forKubeConfigContext(
    ctx: KubeConfigContext,
    signal?: AbortSignal,
  ): Promise<RestClient> {
    const serverTls = await ctx.getServerTls(signal);
    const tlsAuth = await ctx.getClientTls(signal);

    let httpClient: Deno.HttpClient | null = null;
    if (serverTls || tlsAuth) {
      httpClient = Deno.createHttpClient?.({
        caCerts: serverTls ? [serverTls.serverCert] : [],
        cert: tlsAuth?.userCert,
        key: tlsAuth?.userKey,
      });
    }

    const client = new this(ctx, httpClient);
    signal?.addEventListener('abort', client.close);
    return client;
  }

  [Symbol.dispose]() {
    this.httpClient?.close();
    this.httpClient = null;
  }
  close: () => void = this[Symbol.dispose].bind(this);

  performRequest(opts: RequestOptions & {expectTunnel: string[]}): Promise<KubernetesTunnel>;
  performRequest(opts: RequestOptions & {expectStream: true; expectJson: true}): Promise<ReadableStream<JSONValue>>;
  performRequest(opts: RequestOptions & {expectStream: true}): Promise<ReadableStream<Uint8Array>>;
  performRequest(opts: RequestOptions & {expectJson: true}): Promise<JSONValue>;
  performRequest(opts: RequestOptions): Promise<Uint8Array>;
  async performRequest(opts: RequestOptions): Promise<unknown> {
    let path = opts.path || '/';
    if (opts.querystring) {
      path += `?${opts.querystring}`;
    }

    if (isVerbose && path !== '/api?healthcheck') {
      console.error(opts.method, path);
    }

    if (opts.expectTunnel) throw new Error(
      `Channel-based APIs are not currently implemented by this client.`);

    const headers: Record<string, string> = {};

    if (!this.ctx.cluster.server) throw new Error(`No server URL found in KubeConfig`);
    const url = new URL(path, this.ctx.cluster.server).toString();

    const authHeader = await this.ctx.getAuthHeader(opts.abortSignal);
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const accept = opts.accept ?? (opts.expectJson ? 'application/json' : undefined);
    if (accept) headers['Accept'] = accept;

    const contentType = opts.contentType ?? (opts.bodyJson ? 'application/json' : undefined);
    if (contentType) headers['Content-Type'] = contentType;

    const resp = await fetch(url, {
      method: opts.method,
      body: opts.bodyStream ?? opts.bodyRaw ?? JSON.stringify(opts.bodyJson),
      redirect: 'error',
      signal: opts.abortSignal,
      client: this.httpClient,
      headers,
    } as RequestInit);

    // If we got a fixed-length JSON body with an HTTP 4xx/5xx, we can assume it's an error
    if (!resp.ok && resp.headers.get('content-type') == 'application/json' && resp.headers.get('content-length')) {
      const bodyJson = await resp.json();
      const error: HttpError = new Error(`Kubernetes returned HTTP ${resp.status} ${bodyJson.reason}: ${bodyJson.message}`);
      error.httpCode = resp.status;
      error.status = bodyJson;
      throw error;
    }

    if (opts.expectStream) {
      if (!resp.body) return new ReadableStream();
      if (opts.expectJson) {
        return resp.body
          .pipeThrough(new TextDecoderStream('utf-8'))
          .pipeThrough(new TextLineStream())
          .pipeThrough(new JsonParsingTransformer());
      } else {
        return resp.body;
      }

    } else if (opts.expectJson) {
      return resp.json();

    } else {
      return new Uint8Array(await resp.arrayBuffer());
    }
  }
}

type HttpError = Error & {
  httpCode?: number;
  status?: JSONValue;
}
