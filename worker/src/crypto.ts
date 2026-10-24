/**
 * =============================================================================
 * GOTHWAD DRIVE — AES-256-GCM + HKDF-SHA256 VAULT ENCRYPTION & NANO-ID
 * =============================================================================
 *
 * Security & Key Versioning Model:
 * - Primary secret (`key_version = 3`): Reads `env.DRIVE_ENCRYPTION_KEY`
 *   (or alias `env.VAULT_MASTER_KEY` for operator compatibility).
 * - Automatic bootstrap fallback (`key_version = 1`): If no Worker secret is
 *   configured yet, generates and persists a 256-bit CSPRNG key in D1
 *   `system_keys`. Note: `system_keys` lives in the same D1 database as
 *   `drive_vaults`, so operators should configure `DRIVE_ENCRYPTION_KEY` in
 *   Cloudflare Worker Secrets for separation between database storage and
 *   key material.
 * - Per-user HKDF-SHA256 key derivation (`salt = gothwad-drive-user:<user_id>`)
 *   plus AES-256-GCM `additionalData = gothwad-drive-vault:v1:<user_id>`.
 * - Backward-compatible decryption: tries AES-GCM with `additionalData` first,
 *   then falls back to legacy v1/v2 decryption (without `additionalData`) using
 *   the same per-user HKDF key so existing vaults never break.
 */

import type { D1Database, Env } from './types.ts';

const SYSTEM_KEY_ID = 'vault_master_v1';
const HKDF_INFO = new TextEncoder().encode('gothwad-drive-vault-aes256gcm-v1');
const SHARE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function buildVaultAad(userId: string): Uint8Array {
  return new TextEncoder().encode(`gothwad-drive-vault:v1:${userId}`);
}

function getConfiguredMasterSecret(env: Env): string {
  return (env.DRIVE_ENCRYPTION_KEY || env.VAULT_MASTER_KEY || '').trim();
}

async function getOrCreateSystemKeyMaterial(
  db: D1Database,
): Promise<{ material: string; version: number }> {
  const existing = await db
    .prepare('SELECT key_material, key_version FROM system_keys WHERE key_id = ? LIMIT 1')
    .bind(SYSTEM_KEY_ID)
    .first<{ key_material: string; key_version: number }>();

  if (existing?.key_material) {
    return {
      material: String(existing.key_material),
      version: Number(existing.key_version) || 1,
    };
  }

  const randomSeed = new Uint8Array(32);
  crypto.getRandomValues(randomSeed);
  const generatedMaterial = bytesToBase64(randomSeed);
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      'INSERT OR IGNORE INTO system_keys (key_id, key_material, key_version, created_at) VALUES (?, ?, ?, ?)',
    )
    .bind(SYSTEM_KEY_ID, generatedMaterial, 1, nowIso)
    .run();

  const confirmed = await db
    .prepare('SELECT key_material, key_version FROM system_keys WHERE key_id = ? LIMIT 1')
    .bind(SYSTEM_KEY_ID)
    .first<{ key_material: string; key_version: number }>();

  return {
    material: String(confirmed?.key_material || generatedMaterial),
    version: Number(confirmed?.key_version) || 1,
  };
}

async function deriveUserAesKey(rawSecret: string, userId: string): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(rawSecret.trim());
  const baseKey = await crypto.subtle.importKey('raw', secretBytes, 'HKDF', false, ['deriveKey']);
  const saltBytes = new TextEncoder().encode(`gothwad-drive-user:${userId}`);

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: saltBytes,
      info: HKDF_INFO,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptVaultSession(
  db: D1Database,
  env: Env,
  userId: string,
  plaintextSession: string,
): Promise<{ ciphertextBase64: string; ivBase64: string; keyVersion: number }> {
  const envSecret = getConfiguredMasterSecret(env);
  let secretToUse = envSecret;
  let keyVersion = 3;

  if (!secretToUse) {
    const sys = await getOrCreateSystemKeyMaterial(db);
    secretToUse = sys.material;
    keyVersion = sys.version;
  }

  const aesKey = await deriveUserAesKey(secretToUse, userId);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const additionalData = buildVaultAad(userId);

  const encodedPlaintext = new TextEncoder().encode(plaintextSession);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData },
    aesKey,
    encodedPlaintext,
  );

  return {
    ciphertextBase64: bytesToBase64(new Uint8Array(cipherBuffer)),
    ivBase64: bytesToBase64(iv),
    keyVersion,
  };
}

export async function decryptVaultSession(
  db: D1Database,
  env: Env,
  userId: string,
  ciphertextBase64: string | null | undefined,
  ivBase64: string | null | undefined,
  keyVersion = 1,
): Promise<string | null> {
  if (!ciphertextBase64 || !ivBase64) return null;

  let cipherBytes: Uint8Array;
  let ivBytes: Uint8Array;
  try {
    cipherBytes = base64ToBytes(ciphertextBase64);
    ivBytes = base64ToBytes(ivBase64);
  } catch {
    return null;
  }
  if (cipherBytes.byteLength < 16 || ivBytes.byteLength < 8) {
    return null;
  }

  const candidateSecrets: string[] = [];
  const envSecret = getConfiguredMasterSecret(env);

  if (keyVersion >= 2 && envSecret) {
    candidateSecrets.push(envSecret);
  }

  const sysRow = await db
    .prepare('SELECT key_material FROM system_keys WHERE key_id = ? LIMIT 1')
    .bind(SYSTEM_KEY_ID)
    .first<{ key_material: string }>();

  if (sysRow?.key_material) {
    candidateSecrets.push(String(sysRow.key_material));
  }
  if (envSecret && !candidateSecrets.includes(envSecret)) {
    candidateSecrets.push(envSecret);
  }

  const additionalData = buildVaultAad(userId);

  for (const secret of candidateSecrets) {
    let aesKey: CryptoKey;
    try {
      aesKey = await deriveUserAesKey(secret, userId);
    } catch {
      continue;
    }

    // 1. Try current v3 AES-GCM with explicit per-user AAD
    try {
      const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBytes, additionalData },
        aesKey,
        cipherBytes,
      );
      return new TextDecoder().decode(plainBuffer);
    } catch {
      // Fall through to legacy v1/v2 without additionalData
    }

    // 2. Legacy v1/v2 compatibility (encrypted with per-user HKDF salt only)
    try {
      const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBytes },
        aesKey,
        cipherBytes,
      );
      return new TextDecoder().decode(plainBuffer);
    } catch {
      // Try next candidate secret if key rotation occurred
    }
  }

  return null;
}

export function generateShareId(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SHARE_ALPHABET[bytes[i] % SHARE_ALPHABET.length];
  }
  return out;
}
