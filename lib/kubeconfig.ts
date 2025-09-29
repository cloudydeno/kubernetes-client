/*
 * $KUBECONFIG / .kube/config parsing, merging, etc
 *
 * TODO: paths in any of kubeconfig path keys should
 * be relative to the file they were originally found in
 */

import { KubeConfig as BaseKubeConfig } from "./kubeconfig/config.ts";
import {
  createConfigFromEnvironment,
  createConfigFromPath,
  createInClusterConfig,
  createMergedConfig,
  createSimpleUrlConfig,
} from "./kubeconfig/create.ts";

export { KubeConfigContext } from "./kubeconfig/context.ts";
export * from "./kubeconfig/definitions.ts";

export class KubeConfig extends BaseKubeConfig {
  static async readFromPath(path: string): Promise<KubeConfig> {
    return await createConfigFromPath(path);
  }

  static async getDefaultConfig(): Promise<KubeConfig> {
    return await createConfigFromEnvironment();
  }

  static async getInClusterConfig(opts: {
    baseUrl?: string;
    secretsPath?: string;
  } = {}): Promise<KubeConfig> {
    return await createInClusterConfig(opts);
  }

  static getSimpleUrlConfig(opts: {
    baseUrl?: string,
  } = {}): KubeConfig {
    return createSimpleUrlConfig(opts.baseUrl);
  }
}

export const mergeKubeConfigs = createMergedConfig;
