/**
 * =============================================================================
 * GOTHWAD DRIVE WORKER — PER-USER ENCRYPTED MTPROTO CLOUD VAULT (`drive_vaults`)
 * =============================================================================
 */

import type { DriveVaultRow, Env, GothwadUser } from './types.ts';
import { getTelegramApiConfig, resolveGothwadSession } from './auth.ts';
import { decryptVaultSession, encryptVaultSession } from './crypto.ts';
import {
  errorResponse,
  getAccountsApiOrigin,
  getAccountsWebOrigin,
  getAppDomain,
  jsonResponse,
  readJsonBody,
  verifyCsrfOrigin,
} from './http.ts';

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

export interface VaultStatePayload {
  vaultStatus: 'missing' | 'ok' | 'corrupt';
  hasVault: boolean;
  vaultCorrupt: boolean;
  vaultError?: string | null;
  vault: Record<string, any> | null;
}

export async function readVaultStateForUser(
  env: Env,
  user: GothwadUser,
): Promise<VaultStatePayload> {
  const row = await env.DB.prepare('SELECT * FROM drive_vaults WHERE user_id = ? LIMIT 1')
    .bind(user.id)
    .first<DriveVaultRow>();

  if (!row) {
    return {
      vaultStatus: 'missing',
      hasVault: false,
      vaultCorrupt: false,
      vaultError: null,
      vault: null,
    };
  }

  const hasStoredCipher = Boolean(
    row.encrypted_session && String(row.encrypted_session).trim().length > 0,
  );
  const decryptedSession = hasStoredCipher
    ? await decryptVaultSession(
        env.DB,
        env,
        user.id,
        row.encrypted_session,
        row.session_iv,
        Number(row.key_version) || 1,
      )
    : null;

  const folders = parseFoldersJson(row.folders_json);
  const driveConfig = row.drive_chat_id
    ? {
        chatId: String(row.drive_chat_id),
        chatTitle: String(row.drive_title || 'Gothwad Drive'),
        accessHash: String(row.drive_access_hash || '0'),
      }
    : null;

  const vaultDescriptor = {
    userId: row.user_id,
    username: row.username,
    session: decryptedSession,
    tgSession: decryptedSession,
    keyVersion: Number(row.key_version) || 1,
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
  };

  if (hasStoredCipher && !decryptedSession) {
    return {
      vaultStatus: 'corrupt',
      hasVault: false,
      vaultCorrupt: true,
      vaultError: 'vault_decryption_failed',
      vault: vaultDescriptor,
    };
  }

  if (!decryptedSession) {
    return {
      vaultStatus: 'missing',
      hasVault: false,
      vaultCorrupt: false,
      vaultError: null,
      vault: vaultDescriptor,
    };
  }

  return {
    vaultStatus: 'ok',
    hasVault: true,
    vaultCorrupt: false,
    vaultError: null,
    vault: vaultDescriptor,
  };
}

export async function handleBootstrap(
  request: Request,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const session = await resolveGothwadSession(request, env, fetchImpl);
  if (session.upstreamStatus === 429) {
    return errorResponse(request, env, 'rate_limited', 429, session.setCookies, 'Too many authentication requests.');
  }
  if (session.upstreamStatus === 503) {
    return errorResponse(request, env, 'accounts_unavailable', 503, session.setCookies, 'Authentication service is temporarily unavailable.');
  }

  const commonMeta = {
    appDomain: getAppDomain(env),
    accountsWebOrigin: getAccountsWebOrigin(env),
    accountsApiOrigin: getAccountsApiOrigin(env),
    telegramApi: getTelegramApiConfig(env),
  };

  if (!session.authenticated || !session.user) {
    return jsonResponse(
      request,
      env,
      {
        ok: true, authenticated: false, status: 'anonymous', activeId: null,
        authuser: session.authuser, user: null, accounts: [],
        vaultStatus: 'none', hasVault: false, vaultCorrupt: false, vaultError: null, vault: null,
        ...commonMeta,
      },
      200,
      session.setCookies,
    );
  }

  try {
    const vaultState = await readVaultStateForUser(env, session.user);
    return jsonResponse(
      request,
      env,
      {
        ok: true, authenticated: true, status: 'authenticated',
        activeId: session.activeId, authuser: session.authuser,
        user: session.user, accounts: session.accounts,
        ...vaultState,
        ...commonMeta,
      },
      200,
      session.setCookies,
    );
  } catch {
    return errorResponse(request, env, 'vault_unavailable', 503, session.setCookies, 'Cloud vault storage is temporarily unavailable.');
  }
}

export async function handleGetVault(
  request: Request,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const session = await resolveGothwadSession(request, env, fetchImpl);
  if (session.upstreamStatus === 429) {
    return errorResponse(request, env, 'rate_limited', 429, session.setCookies);
  }
  if (session.upstreamStatus === 503) {
    return errorResponse(request, env, 'accounts_unavailable', 503, session.setCookies);
  }
  if (!session.authenticated || !session.user) {
    return errorResponse(request, env, 'unauthenticated', 401, session.setCookies);
  }

  try {
    const vaultState = await readVaultStateForUser(env, session.user);
    return jsonResponse(
      request,
      env,
      {
        ok: true,
        ...vaultState,
      },
      200,
      session.setCookies,
    );
  } catch {
    return errorResponse(
      request,
      env,
      'vault_unavailable',
      503,
      session.setCookies,
      'Cloud vault storage is temporarily unavailable.',
    );
  }
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
  if (session.upstreamStatus === 429) {
    return errorResponse(request, env, 'rate_limited', 429, session.setCookies);
  }
  if (session.upstreamStatus === 503) {
    return errorResponse(request, env, 'accounts_unavailable', 503, session.setCookies);
  }
  if (!session.authenticated || !session.user) {
    return errorResponse(request, env, 'unauthenticated', 401, session.setCookies);
  }

  const body = await readJsonBody(request);
  const expectedUserId = String(
    request.headers.get('X-Gothwad-Expect-User') || body.expectedUserId || '',
  ).trim();
  if (expectedUserId && expectedUserId !== session.user.id) {
    return errorResponse(
      request,
      env,
      'account_mismatch',
      409,
      session.setCookies,
      'Active Gothwad account changed before vault save completed.',
    );
  }

  const existing = await env.DB.prepare('SELECT * FROM drive_vaults WHERE user_id = ? LIMIT 1')
    .bind(session.user.id)
    .first<DriveVaultRow>();

  const hasExistingCipher = Boolean(
    existing?.encrypted_session && String(existing.encrypted_session).trim().length > 0,
  );
  let existingDecrypted: string | null = null;
  if (hasExistingCipher && existing) {
    existingDecrypted = await decryptVaultSession(
      env.DB,
      env,
      session.user.id,
      existing.encrypted_session,
      existing.session_iv,
      Number(existing.key_version) || 1,
    );
    if (!existingDecrypted && body.overwriteCorrupt !== true) {
      return errorResponse(
        request,
        env,
        'vault_corrupt_locked',
        409,
        session.setCookies,
        'Existing encrypted vault could not be decrypted. Confirm recovery overwrite before replacing it.',
      );
    }
  }

  const tgProfile = body.tgProfile && typeof body.tgProfile === 'object' ? body.tgProfile : null;
  const incomingTgUserId =
    tgProfile?.id !== undefined
      ? String(tgProfile.id).trim()
      : body.tgUserId !== undefined
        ? String(body.tgUserId).trim()
        : '';

  if (
    existing?.tg_user_id &&
    existingDecrypted &&
    incomingTgUserId &&
    incomingTgUserId !== String(existing.tg_user_id).trim() &&
    body.allowRelink !== true &&
    body.overwriteCorrupt !== true
  ) {
    return errorResponse(
      request,
      env,
      'tg_account_mismatch',
      409,
      session.setCookies,
      'Vault is already linked to a different Telegram account. Confirm re-link to replace it.',
    );
  }

  let encryptedSession = existing?.encrypted_session ?? null;
  let sessionIv = existing?.session_iv ?? null;
  let keyVersion = Number(existing?.key_version) || 1;

  const rawSessionInput =
    typeof body.session === 'string'
      ? body.session
      : typeof body.tgSession === 'string'
        ? body.tgSession
        : '';
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

  const tgUserId = incomingTgUserId || existing?.tg_user_id || null;
  const tgUsername = tgProfile?.username !== undefined ? String(tgProfile.username) : existing?.tg_username ?? null;
  const tgDisplayName = tgProfile?.displayName !== undefined ? String(tgProfile.displayName) : existing?.tg_display_name ?? null;

  const driveConfig = body.driveConfig && typeof body.driveConfig === 'object' ? body.driveConfig : null;
  const driveChatId = driveConfig?.chatId !== undefined ? String(driveConfig.chatId) : existing?.drive_chat_id ?? null;
  const driveAccessHash = driveConfig?.accessHash !== undefined ? String(driveConfig.accessHash) : existing?.drive_access_hash ?? null;
  const driveTitle = driveConfig?.chatTitle !== undefined ? String(driveConfig.chatTitle) : existing?.drive_title ?? null;

  const rawFoldersInput = body.folders !== undefined ? body.folders : body.topics;
  const foldersJson = rawFoldersInput !== undefined
    ? JSON.stringify(sanitizeFoldersList(rawFoldersInput))
    : existing?.folders_json || '[]';

  const storageUsedBytes = typeof body.storageUsedBytes === 'number' && Number.isFinite(body.storageUsedBytes)
    ? Math.max(0, Math.floor(body.storageUsedBytes))
    : Number(existing?.storage_used_bytes) || 0;
  const fileCount = typeof body.fileCount === 'number' && Number.isFinite(body.fileCount)
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
      username = excluded.username, encrypted_session = excluded.encrypted_session,
      session_iv = excluded.session_iv, key_version = excluded.key_version,
      tg_user_id = excluded.tg_user_id, tg_username = excluded.tg_username,
      tg_display_name = excluded.tg_display_name, drive_chat_id = excluded.drive_chat_id,
      drive_access_hash = excluded.drive_access_hash, drive_title = excluded.drive_title,
      folders_json = excluded.folders_json, storage_used_bytes = excluded.storage_used_bytes,
      file_count = excluded.file_count, updated_at = excluded.updated_at`,
  )
    .bind(
      session.user.id, pureUsername, encryptedSession, sessionIv, keyVersion,
      tgUserId, tgUsername, tgDisplayName, driveChatId, driveAccessHash, driveTitle,
      foldersJson, storageUsedBytes, fileCount, createdAt, nowIso,
    )
    .run();

  return jsonResponse(
    request, env,
    {
      ok: true, userId: session.user.id, tgUserId,
      vaultStatus: encryptedSession ? 'ok' : 'missing',
      hasVault: Boolean(encryptedSession), keyVersion, updatedAt: nowIso,
    },
    200, session.setCookies,
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
  if (session.upstreamStatus === 429) {
    return errorResponse(request, env, 'rate_limited', 429, session.setCookies);
  }
  if (session.upstreamStatus === 503) {
    return errorResponse(request, env, 'accounts_unavailable', 503, session.setCookies);
  }
  if (!session.authenticated || !session.user) {
    return errorResponse(request, env, 'unauthenticated', 401, session.setCookies);
  }

  const url = new URL(request.url);
  const body = await readJsonBody(request);
  const expectedUserId = String(
    request.headers.get('X-Gothwad-Expect-User') ||
      url.searchParams.get('expectedUserId') ||
      body.expectedUserId ||
      '',
  ).trim();
  if (expectedUserId && expectedUserId !== session.user.id) {
    return errorResponse(
      request,
      env,
      'account_mismatch',
      409,
      session.setCookies,
      'Active Gothwad account does not match the vault requested for unlink.',
    );
  }

  await env.DB.prepare('DELETE FROM drive_vaults WHERE user_id = ?')
    .bind(session.user.id)
    .run();

  return jsonResponse(
    request,
    env,
    { ok: true, unlinked: true, userId: session.user.id },
    200,
    session.setCookies,
  );
}
