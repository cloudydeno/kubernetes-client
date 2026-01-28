#!/usr/bin/env -S deno run --allow-env --allow-read --allow-net

import { autoDetectClient } from '@cloudydeno/kubernetes-client';
const client = await autoDetectClient();

const namespace = client.defaultNamespace ?? 'default';
const containerName = 'srv';

// Find the first pod in the namespace.
// In practice, @cloudydeno/kubernetes-apis would provide a typed binding for this call:
const podName = await client.performRequest({
  method: 'GET',
  path: `/api/v1/namespaces/${namespace}/pods`,
  expectJson: true,
}).then(x => (x as any).items.at(0).metadata.name as string);
if (!podName) throw new Error(`No pod found in namespace ${namespace}`);

const querystring = new URLSearchParams();
querystring.append('command', 'uptime');
querystring.set('container', containerName);
querystring.set('stdout', 'true');
querystring.set('stderr', 'true');

const tunnel = await client.performRequest({
  method: 'POST',
  path: `/api/v1/namespaces/${namespace}/pods/${podName}/exec`,
  querystring,
  expectTunnel: ['v5.channel.k8s.io'],
});

const stdout = tunnel.getReadableStream({ index: 1 });
const stderr = tunnel.getReadableStream({ index: 2 });
const status = tunnel.getReadableStream({ index: 3 });
await tunnel.whenReady();

const [statusJson] = await Promise.all([
  new Response(status).json(),
  stdout.pipeTo(Deno.stdout.writable, { preventClose: true }),
  stderr.pipeTo(Deno.stderr.writable, { preventClose: true }),
]);

if (statusJson.status !== 'Success') {
  console.error(statusJson.message);
}
