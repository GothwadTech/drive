/**
 * =============================================================================
 * GOTHWAD DRIVE WORKER — SILENT SSO SESSION VERIFICATION & ACCOUNTS PROXY
 * =============================================================================
 */

import type {
  Env,
  GothwadAccountSummary,
  GothwadUser,
  ResolvedGothwadSession,
} from './types.ts';
import {
  errorResponse,
  extractAllowedSetCookies,
  getAccountsApiOrigin,
  getAccountsWebOrigin,
  getAppDomain,
  jsonResponse,
  verifyCsrfOrigin,
} from './http.ts';

function normalizeUserObject(raw: any, appDomain: string): GothwadUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || raw.userId || '').trim();
  const rawEmail = String(raw.email || '').trim().toLowerCase();
  const username = String(raw.username || (rawEmail ? rawEmail.split('@')[0] : '')).trim().toLowerCase();
  if (!id || !username) return null;

  const firstName = String(raw.firstName ?? raw.first_name ?? '').trim();
  const lastName = String(raw.lastName ?? raw.last_name ?? '').trim();
  const name = String(raw.name || `${firstName} ${lastName}`.trim() || username).trim();
  const avatarUrl = raw.avatarUrl ?? raw.avatar_url ?? null;
  const email = String(raw.email || `${username}@${appDomain}`).trim().toLowerCase();

  return {
    id,
    username,
    email,
    first_name: firstName,
    last_name: lastName,
    firstName,
    lastName,
    name,
    avatar_url: avatarUrl ? String(avatarUrl) : null,
    avatarUrl: avatarUrl ? String(avatarUrl) : null,
    phone_number: raw.phone_number ? String(raw.phone_number) : '',
    two_factor_enabled: Boolean(raw.two_factor_enabled),
    storage_used_bytes: Number(raw.storage_used_bytes) || 0,
    storage_limit_bytes: Number(raw.storage_limit_bytes) || 16106127360,
    created_at: raw.created_at ? String(raw.created_at) : undefined,
  };
}

function normalizeAccountSummary(
  raw: any,
  idx: number,
  appDomain: string,
  accountsWebOrigin: string,
): GothwadAccountSummary {
  const username = String(raw?.username || '').trim().toLowerCase();
  const firstName = String(raw?.firstName ?? raw?.first_name ?? '').trim();
  const lastName = String(raw?.lastName ?? raw?.last_name ?? '').trim();
  const name = String(raw?.name || `${firstName} ${lastName}`.trim() || username || 'Account').trim();
  const authuser = Number.isInteger(raw?.authuser) ? Number(raw.authuser) : idx;
  const avatarUrl = raw?.avatarUrl ?? raw?.avatar_url ?? null;
  const email = String(raw?.email || (username ? `${username}@${appDomain}` : '')).trim().toLowerCase();

  return {
    id: String(raw?.id || raw?.slot || 'a'),
    authuser,
    username,
    name,
    firstName,
    lastName,
    email,
    avatarUrl: avatarUrl ? String(avatarUrl) : null,
    avatar_url: avatarUrl ? String(avatarUrl) : null,
    accountUrl: raw?.accountUrl || `${accountsWebOrigin}/u/${authuser}/me`,
    lastUsedAt: raw?.lastUsedAt ? String(raw.lastUsedAt) : undefined,
  };
}

export function extractAuthuserSelector(request: Request): string | null {
  const headerVal = request.headers.get('X-Gothwad-Authuser')?.trim();
  if (headerVal && /^[0-5]$/.test(headerVal)) return headerVal;

  try {
    const url = new URL(request.url);
    const queryVal = url.searchParams.get('authuser')?.trim();
    if (queryVal && /^[0-5]$/.test(queryVal)) return queryVal;
  } catch {
    // ignore URL parse error
  }
  return null;
}

export async function resolveGothwadSession(
  request: Request,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedGothwadSession> {
  const cookieHeader = request.headers.get('Cookie') || '';
  const authHeader = request.headers.get('Authorization') || '';
  const authuserSelector = extractAuthuserSelector(request);
  const appDomain = getAppDomain(env);
  const accountsApiOrigin = getAccountsApiOrigin(env);
  const accountsWebOrigin = getAccountsWebOrigin(env);

  if (!cookieHeader && !authHeader) {
    return {
      authenticated: false,
      activeId: null,
      authuser: authuserSelector ? Number(authuserSelector) : 0,
      user: null,
      accounts: [],
      setCookies: [],
      upstreamStatus: 401,
    };
  }

  const upstreamHeaders = new Headers({ Accept: 'application/json' });
  if (cookieHeader) upstreamHeaders.set('Cookie', cookieHeader);
  if (authHeader) upstreamHeaders.set('Authorization', authHeader);
  if (authuserSelector !== null) {
    upstreamHeaders.set('X-Gothwad-Authuser', authuserSelector);
  }

  try {
    const res = await fetchImpl(`${accountsApiOrigin}/api/auth/me`, {
      method: 'GET',
      headers: upstreamHeaders,
      redirect: 'manual',
    });

    const setCookies = extractAllowedSetCookies(res.headers);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        authenticated: false,
        activeId: null,
        authuser: 0,
        user: null,
        accounts: [],
        setCookies,
        upstreamStatus: 503,
      };
    }

    const data = (await res.json().catch(() => null)) as Record<string, any> | null;
    if (!res.ok || !data?.authenticated || !data?.user) {
      return {
        authenticated: false,
        activeId: null,
        authuser: authuserSelector ? Number(authuserSelector) : 0,
        user: null,
        accounts: [],
        setCookies,
        upstreamStatus: res.status >= 500 ? 503 : 401,
      };
    }

    const user = normalizeUserObject(data.user, appDomain);
    if (!user) {
      return {
        authenticated: false,
        activeId: null,
        authuser: 0,
        user: null,
        accounts: [],
        setCookies,
        upstreamStatus: 401,
      };
    }

    const rawAccounts: any[] = Array.isArray(data.accounts) ? data.accounts : [];
    const accounts: GothwadAccountSummary[] =
      rawAccounts.length > 0
        ? rawAccounts.map((a, i) => normalizeAccountSummary(a, i, appDomain, accountsWebOrigin))
        : [
            normalizeAccountSummary(
              {
                id: data.activeId || 'a',
                authuser: Number.isInteger(data.authuser) ? data.authuser : 0,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                avatarUrl: user.avatarUrl,
              },
              0,
              appDomain,
              accountsWebOrigin,
            ),
          ];

    const matchedIdx = accounts.findIndex(
      (a) => a.username.toLowerCase() === user.username.toLowerCase(),
    );
    const resolvedAuthuser = Number.isInteger(data.authuser)
      ? Number(data.authuser)
      : matchedIdx >= 0
        ? accounts[matchedIdx].authuser
        : authuserSelector
          ? Number(authuserSelector)
          : 0;

    const activeId = String(
      data.activeId || (matchedIdx >= 0 ? accounts[matchedIdx].id : accounts[0]?.id || 'a'),
    );

    return {
      authenticated: true,
      activeId,
      authuser: resolvedAuthuser,
      user,
      accounts,
      setCookies,
      upstreamStatus: 200,
    };
  } catch {
    return {
      authenticated: false,
      activeId: null,
      authuser: 0,
      user: null,
      accounts: [],
      setCookies: [],
      upstreamStatus: 503,
    };
  }
}

export async function handleMeEndpoint(
  request: Request,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const session = await resolveGothwadSession(request, env, fetchImpl);
  if (session.upstreamStatus === 503) {
    return errorResponse(
      request,
      env,
      'accounts_unavailable',
      503,
      session.setCookies,
      'Authentication service is temporarily unavailable.',
    );
  }

  const rawApiId = Number.parseInt(String(env.TELEGRAM_API_ID || '').trim(), 10);
  const apiId = Number.isInteger(rawApiId) && rawApiId > 0 && rawApiId !== 2496 ? rawApiId : 0;
  const rawHash = String(env.TELEGRAM_API_HASH || '').trim();
  const apiHash = /^[a-fA-F0-9]{32}$/.test(rawHash) ? rawHash : '';

  return jsonResponse(
    request,
    env,
    {
      ok: true,
      authenticated: session.authenticated,
      activeId: session.activeId,
      authuser: session.authuser,
      user: session.user,
      accounts: session.accounts,
      appDomain: getAppDomain(env),
      accountsWebOrigin: getAccountsWebOrigin(env),
      accountsApiOrigin: getAccountsApiOrigin(env),
      telegramApi: apiId > 0 && apiHash ? { apiId, apiHash } : null,
    },
    200,
    session.setCookies,
  );
}

export async function proxyAccountsAuthMutation(
  request: Request,
  env: Env,
  upstreamPath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!verifyCsrfOrigin(request, env)) {
    return errorResponse(request, env, 'csrf_rejected', 403, [], 'Cross-site request rejected');
  }

  const accountsApiOrigin = getAccountsApiOrigin(env);
  const appDomain = getAppDomain(env);
  const cookieHeader = request.headers.get('Cookie') || '';
  const authuserSelector = extractAuthuserSelector(request);
  const bodyText = await request.text().catch(() => '{}');

  const upstreamHeaders = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: `https://drive.${appDomain}`,
  });
  if (cookieHeader) upstreamHeaders.set('Cookie', cookieHeader);
  if (authuserSelector !== null) {
    upstreamHeaders.set('X-Gothwad-Authuser', authuserSelector);
  }

  try {
    const upstreamRes = await fetchImpl(`${accountsApiOrigin}${upstreamPath}`, {
      method: 'POST',
      headers: upstreamHeaders,
      body: bodyText || '{}',
      redirect: 'manual',
    });

    const setCookies = extractAllowedSetCookies(upstreamRes.headers);
    const data = await upstreamRes.json().catch(() => ({ ok: upstreamRes.ok }));
    return jsonResponse(request, env, data, upstreamRes.status, setCookies);
  } catch {
    return errorResponse(
      request,
      env,
      'accounts_unavailable',
      503,
      [],
      'Failed to reach Gothwad Accounts service.',
    );
  }
}
