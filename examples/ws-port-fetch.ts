#!/usr/bin/env -S deno run --allow-env --allow-read --allow-net

// A library that can fetch HTTP over arbitrary streams, such as a pod portforward
import { type Dialer, Client } from "jsr:@cloudydeno/socket-fetch@0.2.1";

import { autoDetectClient, DropPortTransformer } from '@cloudydeno/kubernetes-client';
const kubeClient = await autoDetectClient();

/** Portfowards to the specified Kubernetes pod regardless of dialed URL. */
class PodDialer implements Dialer {
  constructor(
    public readonly namespace: string,
    public readonly podName: string,
    public readonly podPort: number,
  ) {}

  async dial() {
    const querystring = new URLSearchParams();
    querystring.append('ports', `${this.podPort}`);

    const abortCtlr = new AbortController();
    const tunnel = await kubeClient.performRequest({
      method: 'POST',
      path: `/api/v1/namespaces/${this.namespace}/pods/${this.podName}/portforward`,
      querystring,
      abortSignal: abortCtlr.signal,
      expectTunnel: [
        'v5.channel.k8s.io', // doesn't seem supported yet as of kubernetes v1.32
        'v4.channel.k8s.io',
      ],
    });

    const writable = tunnel.getWritableStream({ index: 0 });
    const readable = tunnel.getReadableStream({ index: 0 }).pipeThrough(new DropPortTransformer());
    const errorStream = tunnel.getReadableStream({ index: 1 }).pipeThrough(new DropPortTransformer());

    void errorStream.getReader().read().then(read => {
      if (read.done) return; // no error
      const errorText = new TextDecoder().decode(read.value);
      abortCtlr.abort(new Error(`from kubernetes: ${errorText}`));
    });

    await tunnel.whenReady();
    return { readable, writable };
  }
}

try {
  const client = new Client(new PodDialer('dagd', 'dagd-app-84765665c9-7gxn7', 800));
  const response = await client.fetch('http://localhost/cow?text=hello+world');
  console.log(await response.text());
} catch (err) {
  console.log('req failed:', err);
}
