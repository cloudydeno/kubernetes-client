#!/usr/bin/env -S deno run --allow-env --allow-read --allow-net --unstable-net --cert /var/run/secrets/kubernetes.io/serviceaccount/ca.crt

import { autoDetectClient } from '@cloudydeno/kubernetes-client';
using client = await autoDetectClient();

const querystring = new URLSearchParams();
querystring.append('command', 'sh');
querystring.append('command', '-euxc');
querystring.append('command', 'while read; do sleep 1; done');
querystring.set('container', 'loop');
querystring.set('stdin', 'true');
querystring.set('stdout', 'true');
querystring.set('stderr', 'true');

using tunnel = await client.performRequest({
  method: 'POST',
  path: `/api/v1/namespaces/${'dns'}/pods/${'dns-sync-internet-7bb789dd4-7rg9w'}/exec`,
  querystring,
  expectTunnel: ['v5.channel.k8s.io'], // v5 required to close stdin
});

const stdin  = tunnel.getWritableStream({ index: 0 });
const stdout = tunnel.getReadableStream({ index: 1 });
const stderr = tunnel.getReadableStream({ index: 2 });
const status = tunnel.getReadableStream({ index: 3 });
await tunnel.whenReady();

(async () => {
  const writer = stdin.getWriter();
  for (const idx of Array.from({length:1000}, (_,x) => x)) {
    for (const _ of Array.from({length:30}, (_,x) => x)) {
      await writer.write(new TextEncoder().encode('hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world'));
    }
    await writer.write(new TextEncoder().encode('\n'));
    console.log(idx, writer.desiredSize);

  }
  await writer.close();
})();

const [statusJson] = await Promise.all([
  new Response(status).json(),
  // stdout.pipeTo(Deno.stdout.writable, { preventClose: true }),
  stdout.pipeTo(new WritableStream()),
  stderr.pipeTo(Deno.stderr.writable, { preventClose: true }),
]);

if (statusJson.status !== 'Success') {
  console.error(statusJson.message);
}
