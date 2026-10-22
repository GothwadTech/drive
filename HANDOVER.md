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
| `GET /api/health` | Public | Ensures D1 schema (`system_keys`, `drive_vaults`, `drive_shares`) and returns `{ ok: true, service: "gothwad-drive" }`. |
| `GET /api/me` | Cookie / Optional | Verifies `.gothwadtech.com` SSO session with `ACCOUNTS_API_URL/api/auth/me` and returns `{ authenticated, user, accounts, activeId, authuser, hasVault }`. |
| `POST /api/auth/switch` | Cookie + CSRF | Proxies slot switch to `ACCOUNTS_API_URL/api/auth/switch` and forwards all `gothwad_*` `Set-Cookie` headers. |
| `POST /api/auth/accounts/:id/signout` | Cookie + CSRF | Signs out a single account slot and forwards `Set-Cookie` headers. |
| `POST /api/auth/signout` | Cookie + CSRF | Signs out all slots and forwards `Set-Cookie` headers. |
| `GET /api/drive/vault` | Required | Decrypts and returns the authenticated user's MTProto session (`tgSession`), profile, cached `driveConfig`, and `topics`. |
| `PUT /api/drive/vault` | Required + CSRF | Encrypts `tgSession` with AES-256-GCM (per-user HKDF key + AAD `gothwad-drive-vault:v1:<user_id>`) and upserts `drive_vaults`. |
| `DELETE /api/drive/vault` | Required + CSRF | Deletes the authenticated user's encrypted vault row from `drive_vaults`. |
| `POST /api/drive/shares` | Required + CSRF | Creates a short share record in `drive_shares` and returns `{ ok: true, share: { id, url } }`. |
| `GET /api/drive/shares/:id` | Public | Resolves a short share link `/s/:id`, increments `downloads`, and returns file metadata + manifest. |

---

## 3. Verification & Maintenance

Run the full verification suite locally or in CI:

```bash
npm test
npm run lint
npm run build
npx wrangler deploy --dry-run -c worker/wrangler.toml
```
