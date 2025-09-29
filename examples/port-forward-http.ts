#!/usr/bin/env -S deno run --allow-env --allow-read --allow-net --unstable-net --cert /var/run/secrets/kubernetes.io/serviceaccount/ca.crt

import { autoDetectClient, DropPortTransformer } from '@cloudydeno/kubernetes-client';
const client = await autoDetectClient();

const querystring = new URLSearchParams();
querystring.append('ports', '80');

const tunnel = await client.performRequest({
  method: 'POST',
  path: `/api/v1/namespaces/${'dagd'}/pods/${'dagd-app-84765665c9-7gxn7'}/portforward`,
  querystring,
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
await writer.write(new TextEncoder().encode(`GET /cow?text=hello+world\nHost: localhost\n\n`));
await writer.close(); // no-op without v5.channel.k8s.io protocol

console.log(await new Response(inboundStream).text());
console.log(await new Response(errorStream).text());
