export type FieldErrors = Record<string, string>;

export class ApiClientError extends Error {
  status: number;
  fields?: FieldErrors;

  constructor(message: string, status: number, fields?: FieldErrors) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.fields = fields;
  }
}

type ErrorPayload = { error?: string; fields?: FieldErrors };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const payload = (await res.json().catch(() => null)) as (T & ErrorPayload) | null;

  if (!res.ok) {
    throw new ApiClientError(
      payload?.error ?? `Request failed (${res.status}).`,
      res.status,
      payload?.fields,
    );
  }

  return payload as T;
}
