# Gothwad Drive (v4.0)

**Unlimited Zero-Cost Cloud Storage for the Gothwad Technologies Ecosystem** (`drive.gothwadtech.com`).

Gothwad Drive v4.0 combines a direct browser-to-Telegram MTProto storage engine (`@mtcute/web`) with a Cloudflare Worker + D1 edge layer for silent `.gothwadtech.com` Single Sign-On (SSO), AES-256-GCM encrypted MTProto session vaults, `< 30ms` cached folder tree hydration, and short public share links (`/s/:shareId`).

---

## Architecture Highlights

1. **Zero-Cost Hybrid Storage Model**:
   - **File Bytes**: Stream directly between the user's browser and Telegram Datacenters over WebSocket MTProto (`@mtcute/web`) with 20 MB chunk manifests and a Service Worker (`public/stream-sw.js`) supporting `206 Partial Content` byte-range streaming.
   - **Identity, Encrypted Session Vault & Share Metadata**: Stored in Cloudflare D1 (`drive`, database ID `dfefd813-244a-47f1-8f5a-8d5c15ba3162`) behind the `drive` Cloudflare Worker (`drive.gothwadtech.com/api/*`).
2. **Silent `.gothwadtech.com` Ecosystem SSO**:
   - Reads `.gothwadtech.com` slot cookies (`gothwad_sess_a` .. `gothwad_sess_f`, `gothwad_active`, `gothwad_accounts`) via `GET /api/me` -> `https://api.gothwadtech.com/api/auth/me` with direct browser CORS fallback.
   - Supports `/u/0/` .. `/u/5/` and `?authuser=0..5` multi-account slot routing.
   - Integrates the universal Google-style account switcher (`https://accounts.gothwadtech.com/widget/account-menu.js`, `window.GothwadAccountMenu`) with an instant 0ms Shadow DOM fallback.
3. **AES-256-GCM Encrypted Cloud Session Vault**:
   - Encrypts the user's `@mtcute/web` session string per user using HKDF-SHA256 + WebCrypto `AES-GCM` (256-bit key, 96-bit CSPRNG IV, `gothwad-drive-vault:v1:<user_id>` Additional Authenticated Data).
   - Stores sessions in `MemoryStorage` at runtime and scrubs legacy `tgcd_session*` keys from `localStorage`.
   - Hydrates cached `driveConfig` and `topics` from `/api/drive/vault` for `< 30ms` folder painting before the background MTProto WebSocket handshake completes.
4. **Backward-Compatible Supergroup Radar**:
   - Recognizes both `#GothwadDrive_v1` and `#TgCloudDrive_v1` supergroup descriptions so existing user vaults continue working without data loss.

---

## Repository Structure

```text
├── public/
│   ├── _redirects                 # Cloudflare Pages SPA routing (/s/*, /u/*, /*)
│   └── stream-sw.js               # Range-request streaming Service Worker
├── sql/
│   ├── 00_d1_console_bootstrap.sql # Remote-safe D1 bootstrap SQL (zero PRAGMA)
│   └── 01_drive_schema.sql         # Canonical D1 schema (system_keys, drive_vaults, drive_shares)
├── worker/
│   ├── wrangler.toml              # Worker config (name = "drive", route drive.gothwadtech.com/api/*)
│   └── src/
│       ├── index.ts               # Worker router (/api/health, /api/me, /api/auth/*, /api/drive/*)
│       ├── auth.ts                # Upstream SSO verification & Set-Cookie multi-header forwarding
│       ├── crypto.ts              # HKDF-SHA256 + AES-256-GCM per-user vault encryption
│       ├── vault.ts               # GET / PUT / DELETE /api/drive/vault handlers
│       ├── shares.ts              # POST /api/drive/shares & GET /api/drive/shares/:id handlers
│       ├── schema.ts              # Cold-start idempotent ensureSchema(env.DB)
│       ├── http.ts                # JSON, CORS, and CSRF Origin verification helpers
│       └── types.ts               # Worker TypeScript interfaces
├── src/
│   ├── config/
│   │   ├── brand.ts               # Single source of truth for APP_DOMAIN = "gothwadtech.com"
│   │   └── telegram.ts            # MTProto constants & dual signature detector
│   ├── lib/                       # Modular MTProto, downloader, radar, SSO & Account Menu widget
│   ├── hooks/                     # React hooks (useAuth, useDrive, useFiles, useFileTransfer)
│   ├── components/                # Modular UI components (every file strictly <= 500 lines)
│   └── styles/                    # Theme tokens, utilities, and keyframe animations
└── tests/
    └── drive.test.mjs             # Node 22 node:sqlite + node:test verification suite
```

---

## Quick Start & Verification Commands

```bash
# Install dependencies
npm install

# Run the Node 22 SQLite + Worker + Crypto + Line-Count + English-Only test suite
npm test

# Lint and build the production SPA bundle
npm run lint
npm run build

# Verify Cloudflare Worker dry-run bundle
npx wrangler deploy --dry-run -c worker/wrangler.toml
```

---

## Cloudflare Deployment (No Credit Card Required)

1. **Bootstrap D1 Database (`drive`)**:
   - Open the Cloudflare Dashboard -> **Workers & Pages -> D1 SQL Database -> `drive`** (`dfefd813-244a-47f1-8f5a-8d5c15ba3162`) -> **Console**, paste `sql/00_d1_console_bootstrap.sql`, and click **Execute**.
   - Even if skipped, the Worker automatically runs `ensureSchema(env.DB)` on cold start.
2. **Deploy Worker (`worker/wrangler.toml`)**:
   - Optionally set a master secret: `npx wrangler secret put DRIVE_ENCRYPTION_KEY -c worker/wrangler.toml` (if omitted, the Worker auto-generates and persists a 256-bit CSPRNG master seed in `system_keys`).
   - Deploy: `npx wrangler deploy -c worker/wrangler.toml`.
3. **Deploy Frontend (Cloudflare Pages)**:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Custom domain: `drive.gothwadtech.com`
