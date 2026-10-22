/**
 * =============================================================================
 * GOTHWAD DRIVE WORKER — PER-USER ENCRYPTED MTPROTO CLOUD VAULT (`drive_vaults`)
 * =============================================================================
 */

import type { DriveVaultRow, Env } from './types.ts';
import { resolveGothwadSession } from './auth.ts';
import { decryptVaultSession, encryptVaultSession } from './crypto.ts';
import { errorResponse, jsonResponse, readJsonBody, verifyCsrfOrigin } from './http.ts';

function parseFoldersJson(raw: string | null | undefined): any[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sanitizeFoldersList(folders: unknown): any[] {
  if (!Array.isArray(folders)) return [];
  return folders
    .filter((f) => f && typeof f === 'object' && typeof (f as any).title === 'string')
    .slice(0, 200)
    .map((f: any) => ({
      id: Number(f.id) || 1,
      title: String(f.title).slice(0, 128),
      iconColor: Number(f.iconColor) || 0x6c63ff,
      date: Number(f.date) || Math.floor(Date.now() / 1000),
      messageCount: Number(f.messageCount) || 0,
    }));
}

export async function handleGetVault(
  request: Request,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const session = await resolveGothwadSession(request, env, fetchImpl);
  if (session.upstreamStatus === 503) {
    return errorResponse(request, env, 'accounts_unavailable', 503, session.setCookies);
  }
  if (!session.authenticated || !session.user) {
    return errorResponse(request, env, 'unauthenticated', 401, session.setCookies);
  }

  const row = await env.DB.prepare('SELECT * FROM drive_vaults WHERE user_id = ? LIMIT 1')
    .bind(session.user.id)
    .first<DriveVaultRow>();

  if (!row) {
    return jsonResponse(
      request,
      env,
      {
        ok: true,
        hasVault: false,
        vault: null,
      },
      200,
      session.setCookies,
    );
  }

  const decryptedSession = await decryptVaultSession(
    env.DB,
    env,
    session.user.id,
    row.encrypted_session,
    row.session_iv,
    Number(row.key_version) || 1,
  );

  const folders = parseFoldersJson(row.folders_json);
  const driveConfig = row.drive_chat_id
    ? {
        chatId: String(row.drive_chat_id),
        chatTitle: String(row.drive_title || 'Gothwad Drive'),
        accessHash: String(row.drive_access_hash || '0'),
      }
    : null;

  return jsonResponse(
    request,
    env,
    {
      ok: true,
      hasVault: Boolean(decryptedSession),
      vault: {
        userId: row.user_id,
        username: row.username,
        session: decryptedSession,
        tgSession: decryptedSession,
        tgProfile: row.tg_user_id
          ? {
              id: row.tg_user_id,
              username: row.tg_username || '',
              displayName: row.tg_display_name || '',
            }
          : null,
        driveConfig,
        folders,
        topics: folders,
        storageUsedBytes: Number(row.storage_used_bytes) || 0,
        fileCount: Number(row.file_count) || 0,
        updatedAt: row.updated_at,
      },
    },
    200,
    session.setCookies,
  );
}

export async function handlePutVault(
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
  const existing = await env.DB.prepare('SELECT * FROM drive_vaults WHERE user_id = ? LIMIT 1')
    .bind(session.user.id)
    .first<DriveVaultRow>();

  let encryptedSession = existing?.encrypted_session ?? null;
  let sessionIv = existing?.session_iv ?? null;
  let keyVersion = Number(existing?.key_version) || 1;

  const rawSessionInput = typeof body.session === 'string' ? body.session : typeof body.tgSession === 'string' ? body.tgSession : '';
  if (rawSessionInput.trim().length > 10) {
    const encrypted = await encryptVaultSession(
      env.DB,
      env,
      session.user.id,
      rawSessionInput.trim(),
    );
    encryptedSession = encrypted.ciphertextBase64;
    sessionIv = encrypted.ivBase64;
    keyVersion = encrypted.keyVersion;
  }

  const tgProfile = body.tgProfile && typeof body.tgProfile === 'object' ? body.tgProfile : null;
  const tgUserId =
    tgProfile?.id !== undefined
      ? String(tgProfile.id)
      : existing?.tg_user_id ?? null;
  const tgUsername =
    tgProfile?.username !== undefined
      ? String(tgProfile.username)
      : existing?.tg_username ?? null;
  const tgDisplayName =
    tgProfile?.displayName !== undefined
      ? String(tgProfile.displayName)
      : existing?.tg_display_name ?? null;

  const driveConfig =
    body.driveConfig && typeof body.driveConfig === 'object' ? body.driveConfig : null;
  const driveChatId =
    driveConfig?.chatId !== undefined
      ? String(driveConfig.chatId)
      : existing?.drive_chat_id ?? null;
  const driveAccessHash =
    driveConfig?.accessHash !== undefined
      ? String(driveConfig.accessHash)
      : existing?.drive_access_hash ?? null;
  const driveTitle =
    driveConfig?.chatTitle !== undefined
      ? String(driveConfig.chatTitle)
      : existing?.drive_title ?? null;

  const rawFoldersInput = body.folders !== undefined ? body.folders : body.topics;
  const foldersJson =
    rawFoldersInput !== undefined
      ? JSON.stringify(sanitizeFoldersList(rawFoldersInput))
      : existing?.folders_json || '[]';

  const storageUsedBytes =
    typeof body.storageUsedBytes === 'number' && Number.isFinite(body.storageUsedBytes)
      ? Math.max(0, Math.floor(body.storageUsedBytes))
      : Number(existing?.storage_used_bytes) || 0;

  const fileCount =
    typeof body.fileCount === 'number' && Number.isFinite(body.fileCount)
      ? Math.max(0, Math.floor(body.fileCount))
      : Number(existing?.file_count) || 0;

  const nowIso = new Date().toISOString();
  const createdAt = existing?.created_at || nowIso;
  const pureUsername = session.user.username.toLowerCase();

  await env.DB.prepare(
    `INSERT INTO drive_vaults (
      user_id, username, encrypted_session, session_iv, key_version,
      tg_user_id, tg_username, tg_display_name,
      drive_chat_id, drive_access_hash, drive_title,
      folders_json, storage_used_bytes, file_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      encrypted_session = excluded.encrypted_session,
      session_iv = excluded.session_iv,
      key_version = excluded.key_version,
      tg_user_id = excluded.tg_user_id,
      tg_username = excluded.tg_username,
      tg_display_name = excluded.tg_display_name,
      drive_chat_id = excluded.drive_chat_id,
      drive_access_hash = excluded.drive_access_hash,
      drive_title = excluded.drive_title,
      folders_json = excluded.folders_json,
      storage_used_bytes = excluded.storage_used_bytes,
      file_count = excluded.file_count,
      updated_at = excluded.updated_at`,
  )
    .bind(
      session.user.id,
      pureUsername,
      encryptedSession,
      sessionIv,
      keyVersion,
      tgUserId,
      tgUsername,
      tgDisplayName,
      driveChatId,
      driveAccessHash,
      driveTitle,
      foldersJson,
      storageUsedBytes,
      fileCount,
      createdAt,
      nowIso,
    )
    .run();

  return jsonResponse(
    request,
    env,
    {
      ok: true,
      hasVault: Boolean(encryptedSession),
      updatedAt: nowIso,
    },
    200,
    session.setCookies,
  );
}

export async function handleDeleteVault(
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

  await env.DB.prepare('DELETE FROM drive_vaults WHERE user_id = ?')
    .bind(session.user.id)
    .run();

  return jsonResponse(request, env, { ok: true, unlinked: true }, 200, session.setCookies);
}
