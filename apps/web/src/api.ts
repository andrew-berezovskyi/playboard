export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
let guestBootstrap: Promise<unknown> | null = null;
export function ensurePlayer() {
  return (guestBootstrap ??= api('/chess/player', {}).catch((error) => {
    guestBootstrap = null;
    throw error;
  }));
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers:
        body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Plyvra-Client': 'web' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new ApiError('NETWORK');
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError('SERVICE_UNAVAILABLE');
  }
  if (!response.ok) throw new ApiError((data as { error?: string }).error ?? 'UNKNOWN');
  return data as T;
}
