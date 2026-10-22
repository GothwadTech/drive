/**
 * =============================================================================
 * GOTHWAD DRIVE WORKER — HTTP HELPERS, CORS, CSRF & SET-COOKIE FORWARDING
 * =============================================================================
 */

import type { Env } from './types.ts';

export const UPSTREAM_COOKIE_ALLOWLIST = /^gothwad_[a-z_]+=/;

export function getAppDomain(env: Env): string {
  return (env.APP_DOMAIN || 'gothwadtech.com').trim().toLowerCase();
}

export function getAccountsApiOrigin(env: Env): string {
  const domain = getAppDomain(env);
  const raw = (env.ACCOUNTS_API_URL || `https://api.${domain}`).trim().replace(/\/+$/, '');
  // Never call same-zone accounts.<domain> from a Cloudflare Worker
  if (raw === `https://accounts.${domain}`) {
    return `https://api.${domain}`;
  }
  return raw;
}

export function getAccountsWebOrigin(env: Env): string {
  const domain = getAppDomain(env);
  return (env.ACCOUNTS_WEB_URL || `https://accounts.${domain}`).trim().replace(/\/+$/, '');
}

export function isTrustedOrigin(originHeader: string, env: Env): boolean {
  if (!originHeader) return false;
  const domain = getAppDomain(env);
  const extra = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const url = new URL(originHeader);
    const host = url.hostname.toLowerCase();
    if (
      (url.protocol === 'https:' && (host === domain || host.endsWith(`.${domain}`))) ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.e2b.app') ||
      extra.includes(originHeader)
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function buildCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get('Origin') || '';
  if (origin && isTrustedOrigin(origin, env)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Gothwad-Refresh, X-Gothwad-Authuser',
    );
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

export function verifyCsrfOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin') || '';
  if (origin) {
    return isTrustedOrigin(origin, env);
  }
  const referer = request.headers.get('Referer') || '';
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      return isTrustedOrigin(refOrigin, env);
    } catch {
      return false;
    }
  }
  return false;
}

export function extractAllowedSetCookies(upstreamHeaders: Headers): string[] {
  const rawList: string[] =
    typeof (upstreamHeaders as any).getSetCookie === 'function'
      ? (upstreamHeaders as any).getSetCookie()
      : [];

  if (rawList.length === 0) {
    const single = upstreamHeaders.get('set-cookie');
    if (single) rawList.push(single);
  }

  return rawList.filter((cookie) => UPSTREAM_COOKIE_ALLOWLIST.test(cookie.trim()));
}

export function appendSetCookies(headers: Headers, cookies: string[]): void {
  for (const cookie of cookies) {
    if (UPSTREAM_COOKIE_ALLOWLIST.test(cookie.trim())) {
      headers.append('Set-Cookie', cookie);
    }
  }
}

export function jsonResponse(
  request: Request,
  env: Env,
  data: unknown,
  status = 200,
  setCookies: string[] = [],
): Response {
  const headers = buildCorsHeaders(request, env);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  appendSetCookies(headers, setCookies);
  return new Response(JSON.stringify(data), { status, headers });
}

export function errorResponse(
  request: Request,
  env: Env,
  error: string,
  status = 400,
  setCookies: string[] = [],
  message?: string,
): Response {
  return jsonResponse(
    request,
    env,
    message ? { ok: false, error, message } : { ok: false, error },
    status,
    setCookies,
  );
}

export async function readJsonBody(request: Request): Promise<Record<string, any>> {
  try {
    return (await request.json()) as Record<string, any>;
  } catch {
    return {};
  }
}
