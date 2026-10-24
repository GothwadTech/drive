# Gothwad Drive (v4.0)

**Unlimited Zero-Cost Cloud Storage for the Gothwad Technologies Ecosystem** (`drive.gothwadtech.com`).

Gothwad Drive v4.0 combines a direct browser-to-Telegram MTProto storage engine (`@mtcute/web`) with a Cloudflare Worker + D1 edge layer for silent `.gothwadtech.com` Single Sign-On (SSO), AES-256-GCM encrypted MTProto session vaults, cached folder tree hydration, and short public share links (`/s/:shareId`).

---

## Architecture & Resilience Highlights

1. **Zero-Cost Hybrid Storage Model**:
   - **File Bytes**: Stream directly between the user's browser and Telegram Datacenters over WebSocket MTProto (`@mtcute/web`) with 20 MB chunk manifests and a Service Worker (`public/stream-sw.js`) supporting `206 Partial Content` byte-range streaming.
   - **Identity, Encrypted Session Vault & Share Metadata**: Stored in Cloudflare D1 (`drive`, database ID `dfefd813-244a-47f1-8f5a-8d5c15ba3162`) behind the `drive` Cloudflare Worker (`drive.gothwadtech.com/api/*`).
2. **Single-Identity-Verification Bootstrap (`GET /api/drive/bootstrap`) & Truthful Error Classification**:
   - Verifies `.gothwadtech.com` SSO identity once against `https://api.gothwadtech.com/api/auth/me` and returns both the verified identity and the selected user's cloud vault state in a single round-trip while forwarding all rotated `Set-Cookie` headers individually.
   - Strictly separates confirmed anonymous responses (`401` or `200 { authenticated: false }`) from service and routing errors (`5xx`, `429`, network failures, timeouts, redirects, malformed JSON, or HTML responses when `/api/*` is caught by the SPA catch-all).
   - Renders the verified account shell (`Header`, account switcher, and cached folders) immediately after identity verification without blocking behind optional avatar downloads or background MTProto indexing.
3. **Versioned AES-256-GCM Encrypted Cloud Session Vault & Ciphertext Protection**:
   - Encrypts the user's `@mtcute/web` session string per user using HKDF-SHA256 + WebCrypto `AES-GCM` (`key_version = 2` with `user_id` Additional Authenticated Data, while remaining backward-compatible with `key_version = 1` rows and supporting both `DRIVE_ENCRYPTION_KEY` and `VAULT_MASTER_KEY`).
   - **Security Note on Encryption Keys**: Setting the `DRIVE_ENCRYPTION_KEY` secret in Cloudflare Worker secrets is required to keep the master encryption key separate from the D1 database. The `system_keys` D1 auto-bootstrap key is a zero-configuration fallback and does not protect against a full D1 database dump unless `DRIVE_ENCRYPTION_KEY` is configured as a Worker secret.
   - Distinguishes genuinely missing vaults (`vaultStatus: "missing"`) from unreadable/corrupted ciphertext (`vaultStatus: "corrupt"`). Unreadable ciphertext in D1 is locked against silent overwrite (`409 vault_corrupt_locked`) unless the user explicitly confirms recovery replacement.
4. **Confirmed Vault Migration & Strict Multi-Account Isolation**:
   - Keeps runtime Telegram sessions in `MemoryStorage` and only scrubs legacy `localStorage` sessions after `PUT /api/drive/vault` succeeds.
   - Isolates IndexedDB folder caches (`GothwadDriveDB`) by `${gothwadUserId}:${tgUserId}:${chatId}:${topicId}`, tags legacy local sessions by owner to prevent cross-account auto-import, and verifies `X-Gothwad-Expect-User` on vault mutations (`409 account_mismatch`).
   - Separates non-destructive local disconnect / SSO sign-out from explicit, user-confirmed remote vault unlinking (`DELETE /api/drive/vault`).

---

## Repository Structure

```text
├── public/
│   ├── _redirects                  # Cloudflare Pages SPA routing (/s/*, /u/*, /*)
│   └── stream-sw.js                # Range-request streaming Service Worker
├── sql/
│   ├── 00_d1_console_bootstrap.sql # Remote-safe D1 bootstrap SQL (zero PRAGMA)
│   └── 01_drive_schema.sql         # Canonical D1 schema (system_keys, drive_vaults, drive_shares)
├── worker/
│   ├── wrangler.toml               # Worker config (name = "drive", route drive.gothwadtech.com/api/*)
│   └── src/
│       ├── index.ts                # Worker router (/api/health, /api/me, /api/drive/bootstrap, /api/drive/*)
│       ├── auth.ts                 # Upstream SSO verification & Set-Cookie multi-header forwarding
│       ├── crypto.ts               # Versioned HKDF-SHA256 + AES-256-GCM per-user vault encryption
│       ├── vault.ts                # Bootstrap & GET / PUT / DELETE /api/drive/vault handlers
│       ├── shares.ts               # POST /api/drive/shares & GET /api/drive/shares/:id handlers
│       ├── schema.ts               # Cold-start idempotent ensureSchema(env.DB)
│       ├── http.ts                 # JSON, CORS, and CSRF Origin verification helpers
│       └── types.ts                # Worker TypeScript interfaces
├── src/
│   ├── config/                     # Brand domain & MTProto dual-signature constants
│   ├── lib/                        # Modular SSO/bootstrap/vault client, MTProto, scoped IndexedDB, radar
│   ├── hooks/                      # Generation-safe React hooks (useAuth, useSsoVaultBootAndSync, useDrive, useFiles)
│   ├── components/                 # Modular UI components (every file strictly <= 500 lines)
│   └── styles/                     # Theme tokens, utilities, and keyframe animations
└── tests/
    ├── drive.test.mjs              # Static, SQL, crypto, Worker lifecycle, <=500-line & English-only gates
    └── behavioral.test.mjs         # Behavioral regression suite (timeouts, 503/HTML, corrupt vault lock, isolation)
```

---

## Quick Start & Verification Commands

```bash
# Install dependencies
npm install

# Run both verification suites (tests/drive.test.mjs + tests/behavioral.test.mjs)
npm test

# Lint (0 warnings) and build the code-split production SPA bundle
npm run lint
npm run build

# Verify Cloudflare Worker dry-run bundle
npx wrangler deploy --dry-run -c worker/wrangler.toml
```

---

## Cloudflare Deployment Checklist

1. **Bootstrap D1 Database (`drive`)**:
   - Open Cloudflare Dashboard -> **Workers & Pages -> D1 SQL Database -> `drive`** (`dfefd813-244a-47f1-8f5a-8d5c15ba3162`) -> **Console**, paste `sql/00_d1_console_bootstrap.sql`, and click **Execute**.
2. **Configure Worker Secret & Deploy (`worker/wrangler.toml`)**:
   - Set the encryption secret in Worker secrets so the master key is stored outside D1:
     `npx wrangler secret put DRIVE_ENCRYPTION_KEY -c worker/wrangler.toml`
   - Deploy the Worker and ensure route `drive.gothwadtech.com/api/*` is attached in the `gothwadtech.com` zone:
     `npx wrangler deploy -c worker/wrangler.toml`
3. **Deploy Frontend (Cloudflare Pages)**:
   - Build command: `npm run build`, Output directory: `dist`, Custom domain: `drive.gothwadtech.com`.
