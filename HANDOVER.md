# HANDOVER.md — Gothwad Drive v4.0 Operations & Handover Guide

## 1. Production Endpoints & Bindings

| Resource | Value |
| :--- | :--- |
| **Frontend Origin** | `https://drive.gothwadtech.com` |
| **Worker Route** | `drive.gothwadtech.com/api/*` (zone `gothwadtech.com`) |
| **Worker Name** | `drive` (`worker/wrangler.toml` & `wrangler.toml`) |
| **D1 Database Name** | `drive` |
| **D1 Database ID** | `dfefd813-244a-47f1-8f5a-8d5c15ba3162` |
| **Upstream SSO API** | `https://api.gothwadtech.com` (`env.ACCOUNTS_API_URL`) |
| **Account Switcher Widget** | `https://accounts.gothwadtech.com/widget/account-menu.js` |

---

## 2. Worker API Reference

| Method & Path | Auth | Description |
| :--- | :--- | :--- |
| `GET /api/health` | Public | Returns `{ ok: true, service: "gothwad-drive", engine: "cloudflare-d1-mtproto" }`. |
| `GET /api/drive/bootstrap` | Cookie / Optional | Single-identity-verification bootstrap: verifies identity once with `ACCOUNTS_API_URL/api/auth/me` and returns `{ authenticated, user, accounts, activeId, authuser, vaultStatus, hasVault, vaultCorrupt, vault }`. |
| `GET /api/me` | Cookie / Optional | Compatible SSO session endpoint returning `{ authenticated, user, accounts, activeId, authuser, vaultStatus, hasVault, vaultCorrupt }`. |
| `POST /api/auth/switch` | Cookie + CSRF | Proxies slot switch to `ACCOUNTS_API_URL/api/auth/switch` and forwards all rotated `Set-Cookie` headers individually. |
| `POST /api/auth/accounts/:id/signout` | Cookie + CSRF | Signs out a single account slot without modifying the user's encrypted D1 cloud vault. |
| `POST /api/auth/signout` | Cookie + CSRF | Signs out all SSO slots without modifying the user's encrypted D1 cloud vault. |
| `GET /api/drive/vault` | Required | Decrypts and returns `{ ok: true, vaultStatus: "missing" \| "ok" \| "corrupt", hasVault, vaultCorrupt, vault }`. |
| `PUT /api/drive/vault` | Required + CSRF | Verifies `X-Gothwad-Expect-User` (`409 account_mismatch`), protects unreadable rows (`409 vault_corrupt_locked` unless `overwriteCorrupt: true`), encrypts `session` with AES-256-GCM (`key_version = 2`), and upserts `drive_vaults`. |
| `DELETE /api/drive/vault` | Required + CSRF | Explicit vault unlink endpoint: verifies `X-Gothwad-Expect-User` and deletes the authenticated user's row from `drive_vaults`. |
| `POST /api/drive/shares` | Required + CSRF | Creates a short share record in `drive_shares` and returns `{ ok: true, id, hash, shareUrl }`. |
| `GET /api/drive/shares/:id` | Public | Resolves a short share link `/s/:id`, increments `downloads`, and returns file metadata + manifest. |

---

## 3. Security & Deployment Verification Notes

1. **Encryption Key Separation (`DRIVE_ENCRYPTION_KEY`)**:
   - Always configure `DRIVE_ENCRYPTION_KEY` in Cloudflare Worker secrets (`npx wrangler secret put DRIVE_ENCRYPTION_KEY -c worker/wrangler.toml`).
   - While `worker/src/crypto.ts` supports an automatic 256-bit fallback key in the D1 `system_keys` table for zero-configuration bootstrap, storing the fallback key in D1 does not protect against a full D1 database compromise unless `DRIVE_ENCRYPTION_KEY` is set in Worker secrets.
   - If `DRIVE_ENCRYPTION_KEY` is rotated or mismatched, existing rows return `vaultStatus: "corrupt"` and are locked against automatic overwrite (`409 vault_corrupt_locked`) so ciphertext in D1 is never silently lost.
2. **Production Route Verification (`drive.gothwadtech.com/api/*`)**:
   - Ensure the Cloudflare Worker route `drive.gothwadtech.com/api/*` is attached to the `drive` Worker in the Cloudflare dashboard. If the Worker route is detached, Cloudflare Pages `public/_redirects` (`/* /index.html 200`) will return `text/html` for `/api/*`, which the frontend explicitly diagnoses as `routing_html` rather than a false signed-out state.
   - Note: Live Cloudflare production route/secret state cannot be inspected from the local build sandbox without Cloudflare API credentials and must be verified in the Cloudflare dashboard or via `wrangler deploy`.

---

## 4. Verification Commands

```bash
npm test
npm run lint
npm run build
npx wrangler deploy --dry-run -c worker/wrangler.toml
```
