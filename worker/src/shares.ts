/**
 * =============================================================================
 * GOTHWAD DRIVE WORKER — CLEAN SHORT PUBLIC SHARE LINKS (`/s/:id`)
 * =============================================================================
 */

import type { DriveShareRow, Env } from './types.ts';
import { resolveGothwadSession } from './auth.ts';
import { generateShareId } from './crypto.ts';
import {
  errorResponse,
  getAppDomain,
  jsonResponse,
  readJsonBody,
  verifyCsrfOrigin,
} from './http.ts';

export async function handleCreateShare(
  request: Request,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!verifyCsrfOrigin(request, env)) {
    return errorResponse(request, env, 'csrf_rejected', 403, [], 'Cross-site request rejected');
  }

  const session = await resolveGothwadSession(request, env, fetchImpl);
  if (session.upstreamStatus === 503) {
    return errorResponse(request, env, 'accounts_unavailable', 503, session.setCookies);
  }
  if (!session.authenticated || !session.user) {
    return errorResponse(request, env, 'unauthenticated', 401, session.setCookies);
  }

  const body = await readJsonBody(request);
  const fileObj = body.file && typeof body.file === 'object' ? body.file : null;
  const fileName = String(body.fileName || fileObj?.name || '').trim();
  if (!fileName) {
    return errorResponse(request, env, 'invalid_file', 400, session.setCookies, 'File name is required.');
  }

  const mimeType = String(
    body.mimeType || fileObj?.mimeType || 'application/octet-stream',
  ).trim();
  const sizeBytes = Math.max(0, Math.floor(Number(body.sizeBytes ?? fileObj?.size) || 0));
  const ttlSeconds = Math.max(0, Math.floor(Number(body.ttlSeconds) || 0));
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresAt = ttlSeconds > 0 ? new Date(now + ttlSeconds * 1000).toISOString() : null;

  const payloadObject = {
    chatId: String(body.chatId || fileObj?.chatId || ''),
    sender: session.user.username,
    file: fileObj || {
      id: Number(body.fileId) || 0,
      name: fileName,
      size: sizeBytes,
      mimeType,
      topicId: Number(body.topicId) || 1,
      date: Math.floor(now / 1000),
      manifest: body.manifest || {
        type: 'segmented_file',
        fileName,
        fileSize: sizeBytes,
        chunks: [],
      },
    },
  };

  const sharePayload =
    typeof body.sharePayload === 'string' && body.sharePayload.trim()
      ? body.sharePayload.trim()
      : JSON.stringify(payloadObject);

  let shareId = generateShareId(10);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const exists = await env.DB.prepare('SELECT id FROM drive_shares WHERE id = ? LIMIT 1')
      .bind(shareId)
      .first();
    if (!exists) break;
    shareId = generateShareId(10);
  }

  await env.DB.prepare(
    `INSERT INTO drive_shares (
      id, owner_user_id, owner_username, file_name, mime_type, size_bytes,
      share_payload, downloads, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  )
    .bind(
      shareId,
      session.user.id,
      session.user.username.toLowerCase(),
      fileName,
      mimeType,
      sizeBytes,
      sharePayload,
      expiresAt,
      nowIso,
    )
    .run();

  const appDomain = getAppDomain(env);
  const shareUrl = `https://drive.${appDomain}/s/${shareId}`;

  return jsonResponse(
    request,
    env,
    {
      ok: true,
      id: shareId,
      hash: shareId,
      fullToken: shareId,
      shareUrl,
      expiresAt,
      createdAt: nowIso,
    },
    201,
    session.setCookies,
  );
}

export async function handleGetShare(
  request: Request,
  env: Env,
  shareId: string,
): Promise<Response> {
  const cleanId = String(shareId || '').trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(cleanId)) {
    return errorResponse(request, env, 'invalid_share_id', 400, [], 'Invalid share link ID.');
  }

  const row = await env.DB.prepare('SELECT * FROM drive_shares WHERE id = ? LIMIT 1')
    .bind(cleanId)
    .first<DriveShareRow>();

  if (!row) {
    return errorResponse(request, env, 'share_not_found', 404, [], 'Share link not found.');
  }

  let ttlRemaining = -1;
  if (row.expires_at) {
    const expMs = new Date(row.expires_at).getTime();
    const diffSec = Math.floor((expMs - Date.now()) / 1000);
    if (diffSec <= 0) {
      return errorResponse(request, env, 'share_expired', 410, [], 'This share link has expired.');
    }
    ttlRemaining = diffSec;
  }

  await env.DB.prepare('UPDATE drive_shares SET downloads = downloads + 1 WHERE id = ?')
    .bind(cleanId)
    .run();

  let parsedPayload: Record<string, any> | null = null;
  try {
    parsedPayload = JSON.parse(row.share_payload);
  } catch {
    // ignore invalid JSON payload
  }

  const fileDescriptor = parsedPayload?.file || {
    id: 0,
    name: row.file_name,
    size: Number(row.size_bytes) || 0,
    mimeType: row.mime_type,
    topicId: 1,
    date: Math.floor(new Date(row.created_at).getTime() / 1000),
    manifest: {
      type: 'segmented_file',
      fileName: row.file_name,
      fileSize: Number(row.size_bytes) || 0,
      chunks: [],
    },
  };

  return jsonResponse(request, env, {
    ok: true,
    ttlRemaining,
    share: {
      id: row.id,
      ownerUsername: row.owner_username,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes) || 0,
      sharePayload: row.share_payload,
      downloads: (Number(row.downloads) || 0) + 1,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    },
    data: {
      sender: `${row.owner_username}@${getAppDomain(env)}`,
      chatId: parsedPayload?.chatId || '',
      file: fileDescriptor,
    },
  });
}
