#!/usr/bin/env -S deno run --allow-env --allow-read --allow-net

import { autoDetectClient, DropPortTransformer } from '@cloudydeno/kubernetes-client';
const client = await autoDetectClient();

const podList: any = await client.performRequest({
  method: 'GET',
  path: `/api/v1/namespaces/${'kube-system'}/pods`,
  querystring: new URLSearchParams([
    ['labelSelector', 'name=glbc'],
  ]),
  expectJson: true,
});

const pod = podList.items[0];
if (!pod) throw new Error(`No eligable pod found`);
console.log('Selected pod', pod.metadata.name);

const tunnel = await client.performRequest({
  method: 'POST',
  path: `/api/v1/namespaces/${pod.metadata.namespace}/pods/${pod.metadata.name}/portforward`,
  querystring: new URLSearchParams([
    ['ports', '8080'],
  ]),
  expectTunnel: [
    // v5 required to close stdin
    // but it's seemingly not accepted yet for portforward APIs as of Kubernetes v1.32
    'v5.channel.k8s.io',
    'v4.channel.k8s.io',
  ],
});

const outboundStream = tunnel.getWritableStream({ index: 0 });
const inboundStream = tunnel.getReadableStream({ index: 0 }).pipeThrough(new DropPortTransformer());
const errorStream = tunnel.getReadableStream({ index: 1 }).pipeThrough(new DropPortTransformer());
await tunnel.whenReady();

const writer = outboundStream.getWriter();
await writer.write(new TextEncoder().encode(`GET /healthz HTTP/1.1\r\nhost: localhost\r\nconnection: close\r\n\r\n`));
await writer.close(); // no-op without v5.channel.k8s.io protocol

console.log();
console.log(await new Response(inboundStream).text());
console.log(await new Response(errorStream).text());
