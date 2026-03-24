// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * CORS-safe fetch wrapper
 *
 * Automatically detects runtime environment:
 * - Electron desktop mode → use native fetch() (no CORS restrictions)
 * - Browser dev mode   → proxy through Vite dev server /__api_proxy?url=...
 * - Browser prod mode  → direct fetch() (requires backend/Nginx reverse proxy)
 */

/** Check if running in Electron environment */
function isElectron(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    (window as any).electron
  );
}

/** Check if running in Vite dev server */
function isViteDev(): boolean {
  return import.meta.env?.DEV === true;
}

/**
 * CORS-safe fetch wrapper
 *
 * In browser dev mode, automatically proxies requests to Vite dev server's
 * `/__api_proxy` middleware, which forwards requests to bypass CORS restrictions.
 *
 * @param url    Target URL (same as native fetch parameter)
 * @param init   Request options (same as native fetch parameter)
 * @returns      Response (same as native fetch return value)
 */
export async function corsFetch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const targetUrl = url.toString();

  // Electron or non-dev environment: direct connection
  if (isElectron() || !isViteDev()) {
    return fetch(targetUrl, init);
  }

  // Browser dev mode: use Vite proxy
  const proxyUrl = `/__api_proxy?url=${encodeURIComponent(targetUrl)}`;

  // Serialize original headers to x-proxy-headers header
  // so the proxy middleware can forward them to the target server
  const proxyHeaders = new Headers(init?.headers);

  // Pack original headers into a special header, proxy side is responsible for unpacking
  const originalHeaders: Record<string, string> = {};
  proxyHeaders.forEach((value, key) => {
    originalHeaders[key] = value;
  });

  const proxyInit: RequestInit = {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-headers': JSON.stringify(originalHeaders),
    },
  };

  return fetch(proxyUrl, proxyInit);
}
