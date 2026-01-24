
// Upstream API docs: https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/
export interface RawKubeConfig {
  'apiVersion': "v1";
  'kind': "Config";

  'contexts'?: {name: string, context: ContextConfig}[];
  'clusters'?: {name: string, cluster: ClusterConfig}[];
  'users'?: {name: string, user: UserConfig}[];

  'current-context'?: string;

  /** @deprecated unused since Kubernetes v1.34  */
  'preferences'?: {
    'colors'?: boolean;
    'extensions'?: Array<NamedExtension>;
  };
  'extensions'?: Array<NamedExtension>;
}


export function isRawKubeConfig(raw: unknown): raw is RawKubeConfig {
  const data = raw as RawKubeConfig;
  return data && data.apiVersion === 'v1' && data.kind === 'Config';
}

export interface ContextConfig {
  'cluster'?: string;
  'user'?: string;
  'namespace'?: string;

  'extensions'?: Array<NamedExtension>;
}

export interface ClusterConfig {
  'server'?: string; // URL

  // // TODO: determine what we can/should/will do about these networking things:
  // 'tls-server-name'?: string;
  // 'insecure-skip-tls-verify'?: boolean;
  // 'proxy-url'?: string;
  // 'disable-compression'?: boolean;

  'certificate-authority'?: string; // path
  'certificate-authority-data'?: string; // base64

  'extensions'?: Array<NamedExtension>;
}

export interface UserConfig {
  // static bearer auth
  'token'?: string; // string
  'tokenFile'?: string; // path
  // static basic auth
  'username'?: string;
  'password'?: string;

  // mTLS auth (--allow-read)
  'client-key'?: string; // path
  'client-key-data'?: string; // base64
  'client-certificate'?: string; // path
  'client-certificate-data'?: string; // base64

  // // TODO: impersonation
  // 'as'?: string;
  // 'as-uid'?: string;
  // 'as-groups'?: string[];
  // 'as-user-extra'?: Record<string, string[]>;

  // external auth (--allow-run)
  /** @deprecated Removed in Kubernetes 1.26, in favor of 'exec */
  'auth-provider'?: {name: string, config: UserAuthProviderConfig};
  'exec'?: UserExecConfig;

  'extensions'?: Array<NamedExtension>;
}

/** @deprecated Removed in Kubernetes 1.26, in favor of `UserExecConfig` */
export interface UserAuthProviderConfig {
  'access-token'?: string;
  'expiry'?: string;

  'cmd-args': string;
  'cmd-path': string;
  'expiry-key': string;
  'token-key': string;
}

export interface UserExecConfig {
  'apiVersion':
    | "client.authentication.k8s.io/v1alpha1"
    | "client.authentication.k8s.io/v1beta1"
    | "client.authentication.k8s.io/v1";
  'command': string;
  'args'?: string[];
  'env'?: Array<{
    'name': string;
    'value': string;
  }>;
  'installHint'?: string;
  'provideClusterInfo'?: boolean;
  'interactiveMode'?: 'Never' | 'IfAvailable' | 'Always';
}

export interface NamedExtension {
  'name': string;
  'extension': unknown;
}
export const ExecAuthExtensionName = "client.authentication.k8s.io/exec";


// https://kubernetes.io/docs/reference/config-api/client-authentication.v1beta1/

export interface ExecCredential {
  'apiVersion': UserExecConfig['apiVersion'];
  'kind': 'ExecCredential';
  'spec': ExecCredentialSpec;
  'status'?: ExecCredentialStatus;
}
export function isExecCredential(raw: unknown): raw is ExecCredential {
  const data = raw as ExecCredential;
  return data
      && (data.apiVersion === 'client.authentication.k8s.io/v1alpha1'
        || data.apiVersion === 'client.authentication.k8s.io/v1beta1'
        || data.apiVersion === 'client.authentication.k8s.io/v1')
      && data.kind === 'ExecCredential';
}

export interface ExecCredentialSpec {
  'cluster'?: Cluster;
  'interactive'?: boolean;
}

export interface ExecCredentialStatus {
  'expirationTimestamp': string;
  'token': string;
  'clientCertificateData': string;
  'clientKeyData': string;
}

export interface Cluster {
  'server'?: string;
  'tls-server-name'?: string;
  'insecure-skip-tls-verify'?: boolean;
  'certificate-authority-data'?: string;
  'proxy-url'?: string;
  'disable-compression'?: boolean;
  'config'?: unknown; // comes from the "client.authentication.k8s.io/exec" extension
}
