import { createContext, useContext } from 'react';

export type ApiFailure = 'network' | 'http' | 'login' | 'expired' | 'uncertain';
export class ApiError extends Error {
  constructor(public kind: ApiFailure, public status = 0) { super(kind); }
}
export type ApiRequest = (url: string, options?: RequestInit) => Promise<Response>;
// Infrastructure only: no API data is copied into this context.
export const RequestContext = createContext<ApiRequest | null>(null);
export function useApi(): ApiRequest {
  return useContext(RequestContext) ?? ((url, options) => fetch(url, options));
}

export function isTemporaryReadError(error: unknown) {
  return error instanceof ApiError && (error.kind === 'network' || error.kind === 'http' &&
    (error.status === 408 || error.status === 429 || error.status >= 500));
}

export async function readJson<T>(request: ApiRequest, url: string, options?: RequestInit): Promise<T> {
  const response = await request(url, options);
  if (!response.ok) throw new ApiError(response.status === 401 ? url.endsWith('/login') ? 'login' : 'expired' : 'http', response.status);
  return response.json();
}

export function createSessionRequest(onExpired: () => void) {
  let active = true;
  const reads = new Set<AbortController>();
  const ensureCurrent = (signal?: AbortSignal | null) => {
    if (!active || signal?.aborted) throw new DOMException('Stale session or cancelled read', 'AbortError');
  };
  const request: ApiRequest = async (url, options = {}) => {
    ensureCurrent(options.signal);
    const write = !['GET', 'HEAD'].includes((options.method ?? 'GET').toUpperCase());
    const controller = write ? null : new AbortController();
    const abort = () => controller?.abort();
    if (controller) { reads.add(controller); options.signal?.addEventListener('abort', abort, { once: true }); }
    const signal = controller?.signal ?? options.signal;
    const release = () => { if (controller) reads.delete(controller); options.signal?.removeEventListener('abort', abort); };
    try {
      const response = await fetch(url, { ...options, credentials: 'same-origin', signal });
      ensureCurrent(signal);
      if (response.status === 401 && !url.endsWith('/login')) {
        onExpired();
        throw new ApiError('expired', 401);
      }
      if (!response.ok) release();
      const json = () => response.json();
      // Guard the body as well: fetch may have resolved before the session changed.
      return new Proxy(response, { get(target, property) {
        if (property === 'json') return async () => {
          try { const value = await json(); ensureCurrent(signal); return value; }
          catch (error) {
            ensureCurrent(signal);
            if (response.ok) throw new ApiError(write ? 'uncertain' : 'network');
            throw error;
          } finally { release(); }
        };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    } catch (error) {
      release();
      if (error instanceof ApiError) throw error;
      ensureCurrent(signal);
      throw new ApiError(write ? 'uncertain' : 'network');
    }
  };
  return { request, retire() { active = false; for (const controller of reads) controller.abort(); reads.clear(); } };
}
