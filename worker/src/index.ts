/**
 * =============================================================================
 * GOTHWAD DRIVE CLOUDFLARE WORKER — ENTRY POINT (`drive.gothwadtech.com/api/*`)
 * =============================================================================
 */

import type { Env } from './types.ts';
import { ensureSchema } from './schema.ts';
import { buildCorsHeaders, errorResponse, jsonResponse } from './http.ts';
import { handleMeEndpoint, proxyAccountsAuthMutation } from './auth.ts';
import { handleDeleteVault, handleGetVault, handlePutVault } from './vault.ts';
import { handleCreateShare, handleGetShare } from './shares.ts';

export async function handleWorkerRequest(
  request: Request,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: buildCorsHeaders(request, env) });
  }

  if (path === '/api/health' && method === 'GET') {
    return jsonResponse(request, env, {
      ok: true,
      service: 'gothwad-drive',
      engine: 'cloudflare-d1-mtproto',
    });
  }

  if (path === '/api/me' && method === 'GET') {
    return handleMeEndpoint(request, env, fetchImpl);
  }

  if (path === '/api/auth/switch' && method === 'POST') {
    return proxyAccountsAuthMutation(request, env, '/api/auth/switch', fetchImpl);
  }

  if (path === '/api/auth/signout' && method === 'POST') {
    return proxyAccountsAuthMutation(request, env, '/api/auth/signout', fetchImpl);
  }

  const slotSignOutMatch = path.match(/^\/api\/auth\/accounts\/([a-fA-F0-9_-]+)\/signout$/);
  if (slotSignOutMatch && method === 'POST') {
    const slotId = encodeURIComponent(slotSignOutMatch[1]);
    return proxyAccountsAuthMutation(
      request,
      env,
      `/api/auth/accounts/${slotId}/signout`,
      fetchImpl,
    );
  }

  if (env.DB) {
    await ensureSchema(env.DB);
  }

  if (path === '/api/drive/vault') {
    if (method === 'GET') return handleGetVault(request, env, fetchImpl);
    if (method === 'PUT') return handlePutVault(request, env, fetchImpl);
    if (method === 'DELETE') return handleDeleteVault(request, env, fetchImpl);
    return errorResponse(request, env, 'method_not_allowed', 405);
  }

  if (path === '/api/drive/shares' && method === 'POST') {
    return handleCreateShare(request, env, fetchImpl);
  }

  const shareMatch = path.match(/^\/api\/drive\/shares\/([A-Za-z0-9_-]+)$/);
  if (shareMatch && method === 'GET') {
    return handleGetShare(request, env, shareMatch[1]);
  }

  return errorResponse(request, env, 'not_found', 404, [], 'API route not found.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleWorkerRequest(request, env);
  },
};
