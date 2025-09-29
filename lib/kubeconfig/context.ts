/**
 * $KUBECONFIG / .kube/config parsing, merging, etc
 *
 * TODO: paths in any of kubconfig path keys should
 * be relative to the file they were originally found in
 */

import {
  type ContextConfig,
  type ClusterConfig,
  type UserConfig,
  type ExecCredentialStatus,
  type ExecCredential,
  ExecAuthExtensionName,
  isExecCredential,
} from "./definitions.ts";

export class KubeConfigContext {
  constructor(
    public readonly context: ContextConfig,
    public readonly cluster: ClusterConfig,
    public readonly user: UserConfig,
  ) {}
  private execCred: ExecCredentialStatus | null = null;

  get defaultNamespace(): string | null {
    return this.context.namespace ?? null;
  }

  async getServerTls(signal?: AbortSignal): Promise<{
    serverCert: string;
  } | null> {
    let serverCert = atob(this.cluster["certificate-authority-data"] ?? '') || null;
    if (!serverCert && this.cluster["certificate-authority"]) {
      serverCert = await Deno.readTextFile(this.cluster["certificate-authority"], { signal });
    }

    if (serverCert) {
      return { serverCert };
    }
    return null;
  }

  async getClientTls(signal?: AbortSignal): Promise<{
    userKey: string;
    userCert: string;
  } | null> {
    let userCert = atob(this.user["client-certificate-data"] ?? '') || null;
    if (!userCert && this.user["client-certificate"]) {
      userCert = await Deno.readTextFile(this.user["client-certificate"], { signal });
    }

    let userKey = atob(this.user["client-key-data"] ?? '') || null;
    if (!userKey && this.user["client-key"]) {
      userKey = await Deno.readTextFile(this.user["client-key"], { signal });
    }

    if (!userKey && !userCert && this.user.exec) {
      const cred = await this.getExecCredential(signal);
      if (cred.clientKeyData) {
        return {
          userKey: cred.clientKeyData,
          userCert: cred.clientCertificateData,
        };
      }
    }

    if (userKey && userCert) {
      return { userKey, userCert };
    }
    if (userKey || userCert) throw new Error(
      `Within the KubeConfig, client key and certificate must both be provided if either is provided.`);
    return null;
  }

  async getAuthHeader(signal?: AbortSignal): Promise<string | null> {
    if (this.user.username || this.user.password) {
      const {username, password} = this.user;
      return `Basic ${btoa(`${username ?? ''}:${password ?? ''}`)}`;

    } else if (this.user.token) {
      return `Bearer ${this.user.token}`;

    } else if (this.user.tokenFile) {
      const token = await Deno.readTextFile(this.user.tokenFile, { signal });
      return `Bearer ${token.trim()}`;

    } else if (this.user['auth-provider']) {
      const {name, config} = this.user['auth-provider'];
      switch (name) {

        case 'gcp':
          if (config.expiry && config['access-token']) {
            const expiresAt = new Date(config.expiry);
            if (expiresAt.valueOf() > Date.now()) {
              return `Bearer ${config['access-token']}`;
            } else throw new Error(
              `GCP "auth-provider" token expired, run a kubectl command to refresh. Or consider updating to "exec"`);
          } else throw new Error(
            `GCP "auth-provider" lacks a cached token, run a kubectl command to refresh. Or consider updating to "exec"`);

        default: throw new Error(
          `This kubeconfig's "auth-provider" (${name}) isn't supported. Consider updating to "exec"`);
      }

    } else if (this.user['exec']) {
      const cred = await this.getExecCredential(signal);
      if (cred.token) {
        return `Bearer ${cred.token}`;
      }
      return null;

    } else return null;
  }

  private async getExecCredential(signal?: AbortSignal) {
    if (this.execCred && (
        !this.execCred.expirationTimestamp ||
        new Date(this.execCred.expirationTimestamp) > new Date())) {
      return this.execCred;
    }

    const execConfig = this.user['exec'];
    if (!execConfig) throw new Error(`BUG: execConfig disappeared`);

    const isTTY = Deno.stdin.isTerminal();
    const stdinPolicy = execConfig.interactiveMode ?? 'IfAvailable';
    if (stdinPolicy == 'Always' && !isTTY) {
      throw new Error(`KubeConfig exec plugin wants a TTY, but stdin is not a TTY`);
    }

    const req: ExecCredential = {
      'apiVersion': execConfig.apiVersion,
      'kind': 'ExecCredential',
      'spec': {
        'interactive': isTTY && stdinPolicy != 'Never',
      },
    };
    if (execConfig.provideClusterInfo) {
      const serverTls = await this.getServerTls(signal);
      req.spec.cluster = {
        'config': this.cluster.extensions?.find(x => x.name == ExecAuthExtensionName)?.extension,
        'server': this.cluster.server,
        'certificate-authority-data': serverTls ? btoa(serverTls.serverCert) : undefined,
      };
    }

    const proc = new Deno.Command(execConfig.command, {
      args: execConfig.args,
      stdin: req.spec.interactive ? 'inherit' : 'null',
      stdout: 'piped',
      stderr: 'inherit',
      signal,
      env: {
        ...Object.fromEntries(execConfig.env?.map(x => [x.name, x.value]) ?? []),
        KUBERNETES_EXEC_INFO: JSON.stringify(req),
      },
    });
    try {
      const output = await proc.output();
      if (!output.success) throw new Error(
        `Exec plugin ${execConfig.command} exited with code ${output.code}`);
      const stdout = JSON.parse(new TextDecoder().decode(output.stdout));
      if (!isExecCredential(stdout) || !stdout.status) throw new Error(
        `Exec plugin ${execConfig.command} did not output an ExecCredential`);

      this.execCred = stdout.status;
      return stdout.status;
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) throw new Error(execConfig.installHint
        ?? `Exec plugin ${execConfig.command} not found (${err}). Maybe you need to install it.`);
      throw err;
    }
  }
}
