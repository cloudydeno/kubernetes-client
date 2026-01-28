interface UndiciDispatcher {
  close(): void;
}

export type FetchClient =
| { client: Deno.HttpClient; dispatcher?: undefined }
| { client?: undefined; dispatcher: UndiciDispatcher };
