# TASK.md — Gothwad Drive v4.0 Engineering & Resilience Checklist

## Completed Milestones

- [x] **Phase 0 — Live Code Audit (`PLAN.md`)**:
  - Audited `GothwadTech/drive` and `GothwadTech/accounts` and documented all 8 startup, login, encrypted-vault, and multi-account isolation root causes in `PLAN.md`.
- [x] **Phase 1 — Remote-Safe D1 Schema (`sql/`)**:
  - Verified `sql/00_d1_console_bootstrap.sql` and `sql/01_drive_schema.sql` (`system_keys`, `drive_vaults`, `drive_shares`) with zero `PRAGMA` statements.
- [x] **Phase 2 — Single-Identity-Verification Bootstrap & Hardened Worker (`worker/`)**:
  - Added `GET /api/drive/bootstrap` verifying identity once via `env.ACCOUNTS_API_URL/api/auth/me` and returning both identity and vault state while forwarding all rotated `Set-Cookie` headers individually.
  - Added versioned AES-256-GCM encryption (`key_version = 2` with `user_id` AAD, backward-compatible with `key_version = 1` and supporting `DRIVE_ENCRYPTION_KEY` + `VAULT_MASTER_KEY`).
  - Distinguished `vaultStatus: "missing" | "ok" | "corrupt"`, added `409 vault_corrupt_locked` protection against silent overwrite of unreadable ciphertext, and added `409 account_mismatch` (`X-Gothwad-Expect-User`) and `409 tg_account_mismatch` guards.
- [x] **Phase 3 — Generation-Safe Startup State Machine & Non-Blocking Readiness (`src/`)**:
  - Implemented explicit startup phases (`checking_identity`, `confirmed_anonymous`, `identity_error`, `loading_vault`, `missing_vault`, `vault_error`, `telegram_connecting`, `telegram_error`, `ready`) in `src/hooks/useSsoVaultBootAndSync.ts` and `src/components/auth/StartupStatusView.tsx`.
  - Bounded fetch and MTProto `connect()` / `getMe()` calls with timeouts and `AbortController` / generation cancellation (`src/hooks/useAuth.ts`, `src/lib/authHelpers.ts`).
  - Made Telegram profile avatar downloads asynchronous in the background and deferred folder indexing, bot checks, and stream service worker registration.
  - Eliminated `@mtcute/convert` Node externalization warnings and code-split `Dashboard`, `AppModals`, `PreviewModal`, `@mtcute`, and document preview libraries.
- [x] **Phase 4 — Confirmed Vault Migration, Account Isolation & Non-Destructive Sign-Out**:
  - Delayed legacy `localStorage` session scrubbing until after `saveDriveVaultDetailed` returns `{ ok: true }`, with manual retry and backup export on failure.
  - Scoped IndexedDB `folder_index` keys in `src/lib/db.ts` by `${gothwadUserId}:${tgUserId}:${chatId}:${topicId}` and tagged legacy sessions by owner so Account B never imports Account A's session.
  - Separated non-destructive local disconnect / SSO sign-out from explicit, user-confirmed `unlinkDriveVault`.
- [x] **Phase 5 — Zero Lint Warnings & Behavioral Regression Tests (`tests/`)**:
  - Resolved all 36 ESLint warnings (`npm run lint` passes with 0 warnings and 0 errors).
  - Added `tests/behavioral.test.mjs` alongside `tests/drive.test.mjs` (15/15 passing tests, 100% of files `<= 500` lines, 100% pure English).
