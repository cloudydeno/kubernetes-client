#!/usr/bin/env -S deno run --allow-env --allow-read=/var/run/secrets/kubernetes.io

import { TextLineStream } from '@std/streams/text-line-stream';
import { autoDetectClient } from '@cloudydeno/kubernetes-client';

const client = await autoDetectClient();

// Stream plaintext log lines from a pod
const lineStream = await client.performRequest({
  method: 'GET',
  path: `/api/v1/namespaces/default/pods/lambdabot-0/log`,
  expectStream: true,
  querystring: new URLSearchParams({
    timestamps: '1',
    tailLines: '15',
  }),
}).then(x => x
  .pipeThrough(new TextDecoderStream('utf-8'))
  .pipeThrough(new TextLineStream()));
for await (const line of lineStream) {
  console.log(line);
}

console.log('done');
