import { KubeConfigContext } from "./context.ts";
import type { RawKubeConfig, ContextConfig, ClusterConfig, UserConfig } from "./definitions.ts";

export class KubeConfig {
  constructor(
    public readonly data: RawKubeConfig,
  ) {}

  static fromRaw(data: RawKubeConfig): KubeConfig {
    return new this(data);
  }

  static fromPieces(pieces: {
    contextName?: string;
    context?: ContextConfig;
    cluster?: ClusterConfig;
    user?: UserConfig;
  }): KubeConfig {
    const contextName = pieces.contextName ?? 'inline';
    return new KubeConfig({
      'apiVersion': "v1",
      'kind': "Config",
      'current-context': contextName,
      'contexts': [{
        'name': contextName,
        'context': {
          'cluster': contextName,
          'user': contextName,
          ...pieces.context,
        },
      }],
      'clusters': [{
        'name': pieces.context?.cluster ?? contextName,
        'cluster': pieces.cluster ?? {},
      }],
      'users': [{
        'name': pieces.context?.user ?? contextName,
        'user': pieces.user ?? {},
      }],
    });
  }

  getContext(name?: string): {
    name: string;
    context: ContextConfig;
  } | null {
    return name && this.data.contexts?.find(x => x.name === name) || null;
  }

  getCluster(name?: string): {
    name: string;
    cluster: ClusterConfig;
  } | null {
    return name && this.data.clusters?.find(x => x.name === name) || null;
  }

  getUser(name?: string): {
    name: string;
    user: UserConfig;
  } | null {
    return name && this.data.users?.find(x => x.name === name) || null;
  }

  // client-go is really forgiving about incomplete configs, so let's act similar
  fetchContext(contextName?: string): KubeConfigContext {
    const current = this.getContext(contextName ?? this.data["current-context"]);
    const cluster = this.getCluster(current?.context?.cluster);
    const user = this.getUser(current?.context?.user);

    return new KubeConfigContext(
      current?.context ?? {},
      cluster?.cluster ?? {},
      user?.user ?? {});
  }
}
