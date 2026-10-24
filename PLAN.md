# PLAN.md — Startup, Identity, Vault & Isolation Repair Plan

## 1. Independent Audit & Confirmed Root Causes

1. **Sequential Unbounded Startup (`src/lib/previewSetup.ts`, `src/App.tsx`)**:
   - `useSsoVaultBootAndSync` held a single global `booting` boolean until `fetchSsoMe()`, `fetchDriveVault()`, and `tryAutoConnect()` all finished sequentially.
   - It lacked a generation/abort guard, overall `try/catch/finally` error recovery, and React `<StrictMode>` / unmount cleanup.
   - `tryAutoConnect` depended on `activeAccountId`; when `rememberAccount` updated `activeAccountId`, `tryAutoConnect` changed identity and re-triggered the boot effect.
2. **Unbounded Telegram Connect & Blocking Avatar Download (`src/hooks/useAuth.ts`)**:
   - `connectWithSessionString` awaited up to 3 `client.connect()` retries, `client.getMe()`, and `client.downloadAsBuffer(me.photo.big)` before marking the session ready, with no application timeout or generation check.
3. **False Anonymous & False Missing-Vault Fallbacks (`src/lib/gothwadSso.ts`)**:
   - `fetchGothwadSession` mapped HTTP 503, 500, 429, unexpected HTML (SPA catch-all when Worker route is missing), malformed JSON, and network failures to `{ authenticated: false }`.
   - `fetchDriveVault` mapped 503, HTML, and network failures to `{ hasVault: false, vault: null }`.
   - `worker/src/vault.ts` mapped failed AES-GCM decryption (`decryptVaultSession() === null` on an existing row) to `hasVault: false`, making corrupted/unreadable vaults indistinguishable from missing vaults.
4. **Duplicate Upstream Identity Subrequests (`worker/src/`)**:
   - Startup called `GET /api/me` followed by `GET /api/drive/vault`, causing two sequential `resolveGothwadSession` calls to `${ACCOUNTS_API_URL}/api/auth/me`.
5. **Unawaited Vault Save & Premature Legacy Session Scrubbing (`src/lib/previewSetup.ts`, `src/hooks/useAuth.ts`)**:
   - `useAuth.ts` scrubbed `tgcd_session` inside `rememberAccount` and `connectWithSessionString` before `saveDriveVault` ran.
   - `useSsoVaultBootAndSync` called `void saveDriveVault(...)` without awaiting confirmation before scrubbing `localStorage`.
6. **Cross-Account Leaks & Destructive Sign-Out (`src/App.tsx`, `src/lib/db.ts`)**:
   - `handleSignOutSsoSlot` and `handleSignOutAllSso` called `handleLogout()`, which executed `deleteDriveVault(authuser)` after slot sign-out (risking deletion of the current or next slot's D1 vault).
   - `handleSwitchSsoAccount` ignored `switchSsoAccount` failure results.
   - `src/lib/db.ts` keyed IndexedDB folder caches by bare `topicId` without binding to `gothwadUserId`, `tgUserId`, or `chatId`.

---

## 2. Repair Architecture

### A. Generation-Safe Startup State Machine (`src/lib/startupMachine.ts` & `src/App.tsx`)
- Replace the boolean `booting` flag with a generation-guarded state machine (`StartupState`):
  - `phase`:
    - `"checking_identity"`
    - `"anonymous"` (confirmed HTTP 200/401 JSON with `authenticated: false`)
    - `"identity_error"` (network, timeout, 429, 5xx, redirect, malformed JSON, or HTML routing mismatch)
    - `"loading_vault"`
    - `"vault_missing"` (confirmed `vaultStatus: "missing"`)
    - `"vault_error"` (network/5xx/HTML error or `vaultStatus: "corrupt"`)
    - `"telegram_connecting"`
    - `"telegram_error"`
    - `"ready"`
- Once identity is verified (`ssoUser` present), immediately render the account shell (`Header` with universal account switcher + diagnostic/progress view or cached folders) instead of blocking behind a full-screen spinner.

### B. Combined Same-Origin Bootstrap (`GET /api/drive/bootstrap`)
- Add `GET /api/drive/bootstrap` in `worker/src/index.ts` and `worker/src/vault.ts`:
  - Calls `resolveGothwadSession` **once** per request.
  - Forwards all rotated `gothwad_*` `Set-Cookie` headers individually and sets `Cache-Control: no-store`.
  - Returns identity + `vaultStatus: "none" | "missing" | "ok" | "corrupt"` + decrypted `vault` in a single round-trip.
- Keep `GET /api/me` and `GET /api/drive/vault` backward-compatible, with `vaultStatus` and `vaultCorrupt` fields included on `GET /api/drive/vault`.

### C. Corruption Protection & Versioned AES-256-GCM AAD (`worker/src/crypto.ts`, `worker/src/vault.ts`)
- Bind AES-256-GCM encryption to `additionalData = "gothwad-drive-vault:v1:<user_id>"` (`key_version = 3` with `DRIVE_ENCRYPTION_KEY`, or `key_version = 1` with `system_keys`), while preserving transparent fallback decryption for legacy rows encrypted without `additionalData`.
- In `handlePutVault`:
  - Enforce `expectedUserId` (`X-Gothwad-Expect-User` / `body.expectedUserId`) to prevent cross-account writes (`409 account_mismatch`).
  - If an existing row has unreadable ciphertext (`decryptVaultSession === null`) and `body.overwriteCorrupt !== true`, reject with `409 vault_corrupt_locked` so unreadable vaults are never silently overwritten.
- In `handleDeleteVault`:
  - Require verified ownership (`expectedUserId` match when supplied) and only execute on explicit user unlink/reset, never on ordinary sign-out or account switch.

### D. Bounded Connect, Non-Blocking Avatar, and Safe Migration (`src/hooks/useAuth.ts`)
- Bound `client.connect()` and `client.getMe()` with explicit timeouts and generation checks; dispose superseded `TelegramClient` instances immediately.
- Load `me.photo.big` asynchronously in the background after `connected = true` so avatar downloads never delay startup.
- Keep runtime sessions in `MemoryStorage` scoped by account; never scrub recoverable legacy `localStorage` sessions until `saveDriveVault` returns confirmed success (`ok: true`) for the matching owner.

### E. Account-Scoped Caches (`src/lib/db.ts`, `src/hooks/useFiles.ts`, `src/hooks/useDrive.ts`)
- Scope IndexedDB keys and in-memory topic caches by `${gothwadUserId}:${tgUserId}:${chatId}:${topicId}`.
- Clear in-memory state and abort pending controllers on account switch or sign-out without touching remote D1 vaults.
