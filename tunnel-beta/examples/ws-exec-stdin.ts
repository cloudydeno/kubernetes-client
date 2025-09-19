#!/usr/bin/env -S deno run --allow-env --allow-read --allow-net --unstable-net --cert /var/run/secrets/kubernetes.io/serviceaccount/ca.crt

import { WebsocketRestClient } from "../via-websocket.ts";

const client = await WebsocketRestClient.forInCluster();

const querystring = new URLSearchParams();
querystring.append('command', 'cat');
querystring.set('container', 'loop');
querystring.set('stdin', 'true');
querystring.set('stdout', 'true');
querystring.set('stderr', 'true');

const tunnel = await client.performRequest({
  method: 'POST',
  path: `/api/v1/namespaces/${'dns'}/pods/${'dns-sync-internet-69db7776bc-ktvwn'}/exec`,
  querystring,
  expectTunnel: ['v5.channel.k8s.io'], // v5 required to close stdin
});

const [
  stdin,
  stdout,
  stderr,
  status,
] = await Promise.all([

  tunnel.getChannel({
    streamIndex: 0,
    readable: false,
    writable: true,
  }).then(x => x.writable),

  tunnel.getChannel({
    streamIndex: 1,
    readable: true,
    writable: false,
  }).then(x => x.readable),

  tunnel.getChannel({
    streamIndex: 2,
    readable: true,
    writable: false,
  }).then(x => x.readable),

  tunnel.getChannel({
    streamIndex: 3,
    readable: true,
    writable: false,
  }).then(x => x.readable),

]);
await tunnel.ready();

const writer = stdin.getWriter();
await writer.write(new TextEncoder().encode('hello world'))
await writer.close();

const [statusJson] = await Promise.all([
  new Response(status).json(),
  stdout.pipeTo(Deno.stdout.writable, { preventClose: true }),
  stderr.pipeTo(Deno.stderr.writable, { preventClose: true }),
]);
console.error(statusJson);
