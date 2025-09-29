import { dirname } from '@std/path/dirname';
import { join as joinPath } from '@std/path/join';
import { resolve as resolvePath } from '@std/path/resolve';
import { parse as parseYaml } from '@std/yaml/parse';

import {
  isRawKubeConfig,
  type ClusterConfig,
  type ContextConfig,
  type NamedExtension,
  type RawKubeConfig,
  type UserConfig,
} from "./definitions.ts";
import { KubeConfig } from "./config.ts";

export async function createInClusterConfig({
  // Using this baseUrl
  baseUrl = 'https://kubernetes.default.svc.cluster.local',
  secretsPath = '/var/run/secrets/kubernetes.io/serviceaccount',
  signal = undefined as undefined | AbortSignal,
}={}): Promise<KubeConfig> {
  // Avoid interactive prompting for in-cluster secrets.
  // These are not commonly used from an interactive session.
  const readPermission = await Deno.permissions.query({name: 'read', path: secretsPath});
  if (readPermission.state !== 'granted') {
    throw new Error(`Lacking --allow-read=${secretsPath}`);
  }

  const [namespace, caData, tokenData] = await Promise.all([
    Deno.readTextFile(joinPath(secretsPath, 'namespace'), { signal }),
    Deno.readTextFile(joinPath(secretsPath, 'ca.crt'), { signal }),
    Deno.readTextFile(joinPath(secretsPath, 'token'), { signal }),
  ]);

  return KubeConfig.fromPieces({
    context: {
      'namespace': namespace,
    },
    cluster: {
      'server': baseUrl,
      'certificate-authority-data': btoa(caData),
    },
    user: {
      'token': tokenData,
    },
  });
}

export async function createConfigFromPath(path: string, signal?: AbortSignal): Promise<KubeConfig> {
  const data = parseYaml(await Deno.readTextFile(path, { signal }));
  if (isRawKubeConfig(data)) {
    resolveKubeConfigPaths(dirname(path), data);
    return new KubeConfig(data);
  }
  throw new Error(`KubeConfig's "apiVersion" and "kind" fields weren't set`);
}

export async function createConfigFromEnvironment(signal?: AbortSignal): Promise<KubeConfig> {
  const delim = Deno.build.os === 'windows' ? ';' : ':';
  const path = Deno.env.get("KUBECONFIG");
  const paths = path ? path.split(delim) : [];

  if (!path) {
    // default file is ignored if it's not found
    const defaultPath = joinPath(Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "/root", ".kube", "config");
    try {
      return await createConfigFromPath(defaultPath);
    } catch (err: unknown) {
      if ((err as Error).name === 'NotFound') {
        return createMergedConfig([]);
      }
      throw err;
    }
  }

  const allConfigs = await Promise.all(paths
    .filter(x => x)
    .map(x => createConfigFromPath(x, signal)));
  return createMergedConfig(allConfigs);
}

export function createSimpleUrlConfig(
  server = 'http://localhost:8080',
): KubeConfig {
  return KubeConfig.fromPieces({
    cluster: { server },
  });
}

export function createMergedConfig(configs: Array<KubeConfig>): KubeConfig {
  let currentContext = '';
  const contexts = new Map<string, {name: string, context: ContextConfig}>();
  const clusters = new Map<string, {name: string, cluster: ClusterConfig}>();
  const users = new Map<string, {name: string, user: UserConfig}>();
  let extensions = new Array<NamedExtension>();

  // the first value should always be used as-is for each map / object
  // instead of implementing that, do the opposite, and in reverse order
  for (const source of configs.toReversed()) {
    const config = source.data;

    if (config['current-context']) {
      currentContext = config['current-context'];
    }

    for (const context of config.contexts ?? []) {
      contexts.set(context.name, context);
    }
    for (const cluster of config.clusters ?? []) {
      clusters.set(cluster.name, cluster);
    }
    for (const user of config.users ?? []) {
      users.set(user.name, user);
    }

    for (const extension of config.extensions ?? []) {
      extensions = [
        ...extensions.filter(x => x.name !== extension.name),
        extension,
      ];
    }
  }

  return new KubeConfig({
    'apiVersion': "v1",
    'kind': "Config",
    'current-context': currentContext,
    'contexts': Array.from(contexts.values()),
    'clusters': Array.from(clusters.values()),
    'users': Array.from(users.values()),
    'extensions': extensions,
  });
}

function resolveKubeConfigPaths(dir: string, data: RawKubeConfig): void {
  const { clusters = [], users = [] } = data;
  for (const { cluster } of clusters) {
    const ca = cluster['certificate-authority'];
    if (ca) {
      cluster['certificate-authority'] = resolvePath(dir, ca);
    }
  }
  for (const { user } of users) {
    const key = user['client-key'];
    const cert = user['client-certificate'];
    const token = user['tokenFile'];
    if (token) {
      user['tokenFile'] = resolvePath(dir, token);
    }
    if (key) {
      user['client-key'] = resolvePath(dir, key);
    }
    if (cert) {
      user['client-certificate'] = resolvePath(dir, cert);
    }
  }
}
