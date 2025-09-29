// The API contract that all generated code expects

export type HttpMethods =
  | "GET"
  | "POST"
  | "DELETE"
  | "PUT"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

export interface RequestOptions {
  method: HttpMethods;
  path: string;
  querystring?: URLSearchParams;
  abortSignal?: AbortSignal;

  contentType?: string;
  bodyRaw?: Uint8Array;
  bodyJson?: JSONValue;
  bodyStream?: ReadableStream<Uint8Array>;

  accept?: string;
  expectTunnel?: string[];
  expectStream?: boolean;
  expectJson?: boolean;
}

export interface KubernetesTunnel extends Disposable {
  /** Indicates which network protocol is in use.
   * This changes semantics, largely due to Kubernetes tunnel API quirks. */
  readonly transportProtocol: 'SPDY' | 'WebSocket' | 'Opaque';
  readonly subProtocol: string;
  getReadableStream(ids: {
    index?: number;
    spdyHeaders?: Record<string,string | number>;
  }): ReadableStream<Uint8Array>;
  getWritableStream(ids: {
    index?: number;
    spdyHeaders?: Record<string,string | number>;
  }): WritableStream<Uint8Array>;
  /** Call once after creating the initial channels. */
  whenReady(): Promise<void>;
  /** Disconnects the underlying transport. */
  close(): Promise<void>;
}

export interface RestClient extends Disposable {
  performRequest(opts: RequestOptions & {expectTunnel: string[]}): Promise<KubernetesTunnel>;
  performRequest(opts: RequestOptions & {expectStream: true; expectJson: true}): Promise<ReadableStream<JSONValue>>;
  performRequest(opts: RequestOptions & {expectStream: true}): Promise<ReadableStream<Uint8Array>>;
  performRequest(opts: RequestOptions & {expectJson: true}): Promise<JSONValue>;
  performRequest(opts: RequestOptions): Promise<Uint8Array>;
  defaultNamespace?: string;
  close?(): void;
}

// Structures that JSON can encode directly
export type JSONPrimitive = string | number | boolean | null | undefined;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = {[key: string]: JSONValue};
export type JSONArray = JSONValue[];

// Constraint for when these fields will surely be present
export type ApiKind = {
  apiVersion: string;
  kind: string;
}

// Types seen in a resource watch stream
export type WatchEvent<T,U> = WatchEventObject<T> | WatchEventError<U> | WatchEventBookmark;
export type WatchEventObject<T> = {
  'type': "ADDED" | "MODIFIED" | "DELETED";
  'object': T;
};
export type WatchEventError<U> = {
  'type': "ERROR";
  'object': U;
};
export type WatchEventBookmark = {
  'type': "BOOKMARK";
  'object': { metadata: { resourceVersion: string }};
};
