// Ponyfile several Deno APIs so that this library can possibly work under NodeJS

export async function readTextFile(path: string, options?: Deno.ReadFileOptions) {
  if (globalThis.Deno) {
    return await Deno.readTextFile(path, options);
  }
  const fs = await import('node:fs/promises');
  const buffer = await fs.readFile(path, options);
  return buffer.toString();
}

export function getEnv(key: string) {
  if (globalThis.Deno) {
    return Deno.env.get(key);
  }
  return globalThis.process.env[key];
}
