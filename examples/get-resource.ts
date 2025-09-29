#!/usr/bin/env -S deno run --allow-env --allow-read=/var/run/secrets/kubernetes.io

import { autoDetectClient } from '@cloudydeno/kubernetes-client';

const client = await autoDetectClient();

// Grab a single resource as JSON
console.log(await client.performRequest({
  method: 'GET',
  path: `/api/v1/namespaces/default/endpoints`,
  expectJson: true,
  querystring: new URLSearchParams({
    limit: '1',
  }),
}));
