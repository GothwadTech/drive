# AGENTS.md — Engineering Rules for `GothwadTech/drive`

This document defines the mandatory architectural, security, and code-quality standards for every contributor and AI coding agent working on `GothwadTech/drive`.

---

## 1. Non-Negotiable Rules

1. **Rule #0 — 100% Pure English Everywhere**:
   - Every UI string, comment, SQL statement, commit message, test assertion, and documentation file must be written in clear, idiomatic English.
   - Zero Devanagari script (`[\u0900-\u097F]`) or Hinglish tokens are permitted anywhere in the repository. This is enforced automatically by `tests/drive.test.mjs`.
2. **Strict `<= 500` Lines Per File Gate**:
   - Every `.ts`, `.tsx`, `.js`, `.mjs`, `.css`, `.sql`, `.toml`, and `.md` file in the repository must be strictly `<= 500` lines.
   - Split large components or libraries into focused sub-modules before any file approaches 500 lines. Enforced automatically by `tests/drive.test.mjs`.
3. **Remote-Safe Cloudflare D1 SQL (Zero `PRAGMA`)**:
   - Never include `PRAGMA` statements (`PRAGMA foreign_keys`, `PRAGMA journal_mode`, etc.) in `sql/*.sql` or `worker/src/schema.ts`. Remote Cloudflare D1 rejects raw `PRAGMA` execution with `SQLITE_AUTH`.
4. **Never Call Same-Zone `accounts.<domain>/api/*` From a Worker**:
   - Cloudflare Workers subrequests to another Worker route on the same zone can fail or loop. Always call `env.ACCOUNTS_API_URL` (`https://api.gothwadtech.com`) from Worker code.
5. **Centralized Domain Branding (`src/config/brand.ts`)**:
   - `APP_DOMAIN = "gothwadtech.com"` in `src/config/brand.ts` is the single source of truth for frontend URLs (`ACCOUNTS_ORIGIN`, `ACCOUNTS_API_ORIGIN`, `DRIVE_ORIGIN`, `ACCOUNT_MENU_SCRIPT_URL`).
6. **Backward-Compatible Telegram Supergroup Signatures**:
   - `src/config/telegram.ts` (`hasDriveSignature`) and `src/lib/radar.ts` must always recognize both `#GothwadDrive_v1` and `#TgCloudDrive_v1`.

---

## 2. Security & Session Vault Contract

- **Encrypted Cloud Session Vault (`drive_vaults`)**:
  - `@mtcute/web` session strings are encrypted in `worker/src/crypto.ts` using HKDF-SHA256 + AES-256-GCM with per-user Additional Authenticated Data (`gothwad-drive-vault:v1:<user_id>`).
  - Never log or return raw session strings outside authenticated `GET /api/drive/vault` responses.
  - Once synced to the cloud vault, remove legacy `tgcd_session*` entries from browser `localStorage` and keep runtime MTProto sessions in `MemoryStorage`.
- **Multi-Account Cookie Forwarding**:
  - When proxying `/api/me` or `/api/auth/*` to `env.ACCOUNTS_API_URL`, always forward incoming `Cookie` and `X-Gothwad-Authuser` headers, and iterate `upstreamResponse.headers.getSetCookie()` to append each `gothwad_*` cookie individually.
- **CSRF Origin Verification**:
  - All state-changing Worker endpoints (`POST`, `PUT`, `DELETE`) must call `verifyCsrfOrigin(request, env)` and reject untrusted origins with HTTP `403`.

---

## 3. Pre-Commit Verification Checklist

Every change must pass all four commands with zero errors or warnings before committing:

```bash
npm test
npm run lint
npm run build
npx wrangler deploy --dry-run -c worker/wrangler.toml
```
