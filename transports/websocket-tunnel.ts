import type { KubernetesTunnel } from "../lib/contract.ts";

/**
 * Implements opening a bidirectional tunnel to access specific Kubernetes APIs.
 * Notably used for pod exec, attach, and port-forward.
 *
 * WebSockets have various limits within the Kubernetes and Deno ecosystem,
 * but with Deno 2.5.1 or later they should now have similar compatibility as the normal APIs.
 *
 * This transport uses Websockets. Note that the Kubernetes port-forward API
 * is less performant when using Websockets due to lack of dynamic multiplexing.
 * Every new forwarded port connection requires a new WebSocket.
 * Kubectl achieves better performance via implementing SPDY, a long-abandoned protocol.
 * (TODO: find or create Kubernetes ticket to track this restriction specifically)
 */
export function openWebsocketTunnel(
  opts: {
    url: string;
    protocols: string[];
    headers?: HeadersInit;
    httpClient?: Deno.HttpClient;
    signal?: AbortSignal;
  },
): KubernetesTunnel {
  const url = opts.url.replace(/^http/, 'ws');
  const websocket = new WebSocket(url, {
    //@ts-ignore Types for this only pass under Deno 2.5+
    headers: opts.headers,
    protocols: opts.protocols,
    client: opts.httpClient,
  });
  return new WebsocketTunnel(websocket, opts.signal);
}

/**
 * Handles an individual WebSocket connection to the Kubernetes API.
 * Kubernetes WebSockets support up to 255 indexed bytestreams.
 * To send or receive data, you must first provide the channel's index,
 * and then streams will be returned for that particular index.
 *
 * WebSocket channels do not support closing individual streams.
 * You must disconnect the overall tunnel if you wish to end things.
 */
export class WebsocketTunnel implements KubernetesTunnel {
  constructor(
    private readonly websocket: WebSocket,
    stopSignal?: AbortSignal,
  ) {

    stopSignal?.addEventListener('abort', this.close.bind(this));

    this.openPromise = new Promise<void>((ok, fail) => {
      this.websocket.addEventListener('open', () => {
        ok();
      });
      this.websocket.addEventListener('close', evt => {
        for (const downstream of this.downstreamChannels.values()) {
          if (stopSignal?.aborted) downstream.abort(stopSignal.reason);
          else downstream.close();
        }
        this.downstreamChannels.clear();
        if (evt.code) {
          fail(new Error(`WebSocket closed during setup with code ${evt.code} (reason: ${evt.reason})`));
        } else {
          fail(new Error(`WebSocket connection rejected. Does the requested path/Pod exist?`));
        }
      });
    });

    websocket.binaryType = 'arraybuffer';
    websocket.addEventListener('message', evt => {
      // console.error('ws message', evt.data);

      // Fetch basic framing from the inbound packet
      const chunk = evt.data as ArrayBuffer | string;
      if (typeof chunk == 'string') throw new Error(`Unexpected inbound message type`);
      const channelNum = new DataView(chunk).getInt8(0);
      if (typeof channelNum != 'number') throw new Error(`Unexpected inbound message byte`);

      // Implement inbound StreamClose feature added in channel v5 protocol
      // No evidence of kubectl emitting this as of writing.
      if (channelNum == 255 && this.websocket.protocol == 'v5.channel.k8s.io') {
        const closedChannelNum = new DataView(chunk).getInt8(1);
        console.error(`DEV NOTE: Kubernetes server closed a tunnel stream we were reading from`);
        if (typeof closedChannelNum != 'number') throw new Error(`Unexpected closed message byte`);

        // Route received close to a particular stream
        const closedStream = this.downstreamChannels.get(channelNum);
        if (!closedStream) throw new Error(
          `Channel ${channelNum} received a close without being set up for reading`);
        void closedStream.close();
        this.downstreamChannels.delete(channelNum);
        return;
      }

      // Route received packet to a particular stream
      const downstream = this.downstreamChannels.get(channelNum);
      if (!downstream) throw new Error(
        `Channel ${channelNum} received a packet without being set up for reading`);
      void downstream.write(new Uint8Array(chunk.slice(1)));
    });
  }

  /**
   * Resolves when the websocket has successfully connected.
   * Rejects if the connection attempt fails.
   * */
  public async whenReady(): Promise<void> {
    await this.openPromise;
  }
  private readonly openPromise: Promise<void>;

  public readonly transportProtocol: "WebSocket" = "WebSocket";
  public get subProtocol(): string {
    return this.websocket.protocol;
  }

  public maxBufferedAmount: number = 64*1024;
  public bufferIntervalMillis: number = 100;

  private activeBufferDelay: Promise<void> | null = null;
  private bufferDelay(): Promise<void> {
    if (this.activeBufferDelay) {
      return this.activeBufferDelay;
    }
    if (this.websocket.bufferedAmount < this.maxBufferedAmount) {
      return Promise.resolve();
    }
    this.activeBufferDelay = new Promise(ok => {
      const timer = setInterval(() => {
        if (this.websocket.bufferedAmount < this.maxBufferedAmount) {
          ok();
          clearInterval(timer);
          this.activeBufferDelay = null;
        }
      }, this.bufferIntervalMillis);
    });
    return this.activeBufferDelay;
  }

  close(): Promise<void> {
    this.websocket.close(1000);
    return Promise.resolve();
  }
  [Symbol.dispose](): void {
    this.close();
  }

  private readonly downstreamChannels = new Map<number, WritableStreamDefaultWriter<Uint8Array>>();

  getReadableStream(ids: { index?: number; }): ReadableStream<Uint8Array> {
    const streamIndex = ids.index;
    if (typeof streamIndex != 'number') throw new Error(
      "Cannot get a WebSocket channel without a streamIndex.");

    const pipe = new TransformStream<Uint8Array,Uint8Array>();
    this.downstreamChannels.set(streamIndex, pipe.writable.getWriter());
    return pipe.readable;
  }

  getWritableStream(ids: { index?: number; }): WritableStream<Uint8Array> {
    const streamIndex = ids.index;
    if (typeof streamIndex != 'number') throw new Error(
      "Cannot get a WebSocket channel without a streamIndex.");

    return new WritableStream<Uint8Array>({
      write: async (chunk) => {
        await this.bufferDelay();
        this.websocket.send(prependChannel(streamIndex, chunk));
      },
      close: async () => {
        if (this.websocket.protocol == 'v5.channel.k8s.io') {
          await this.bufferDelay();
          this.websocket.send(prependChannel(255, new Uint8Array([streamIndex])));
        }
      },
    }, new ByteLengthQueuingStrategy({ highWaterMark: 1024 }));
  }
}

function prependChannel(channelOctet: number, chunk: Uint8Array): Uint8Array {
  const buf = new ArrayBuffer(chunk.byteLength + 1);
  new DataView(buf).setUint8(0, channelOctet);
  const array = new Uint8Array(buf);
  array.set(chunk, 1);
  return array;
}
