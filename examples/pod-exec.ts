#!/usr/bin/env -S deno run --allow-env --allow-read --allow-net

import { autoDetectClient } from '@cloudydeno/kubernetes-client';
const client = await autoDetectClient();

const querystring = new URLSearchParams();
querystring.append('command', 'uptime');
querystring.set('container', 'loop');
querystring.set('stdout', 'true');
querystring.set('stderr', 'true');

const tunnel = await client.performRequest({
  method: 'POST',
  path: `/api/v1/namespaces/${'dns'}/pods/${'dns-sync-internet-7bb789dd4-7rg9w'}/exec`,
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
