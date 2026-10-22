# TASK.md — Gothwad Drive v4.0 Upgrade Checklist

## Completed Milestones

- [x] **Phase 0 — Live Code Audit**:
  - Audited `GothwadTech/drive` and `GothwadTech/accounts` (`account-menu.js`, SSO cookie/header contracts, D1 bootstrap conventions).
- [x] **Phase 1 — Remote-Safe D1 Schema (`sql/`)**:
  - Created `sql/00_d1_console_bootstrap.sql` and `sql/01_drive_schema.sql` (`system_keys`, `drive_vaults`, `drive_shares`) with zero `PRAGMA` statements.
- [x] **Phase 2 — Modular Cloudflare Worker (`worker/`)**:
  - Created `worker/wrangler.toml` and root `wrangler.toml` bound to D1 `drive` (`dfefd813-244a-47f1-8f5a-8d5c15ba3162`) and route `drive.gothwadtech.com/api/*`.
  - Implemented `worker/src/types.ts`, `schema.ts`, `crypto.ts`, `http.ts`, `auth.ts`, `vault.ts`, `shares.ts`, and `index.ts`.
- [x] **Phase 3 — Silent SSO, Encrypted Session Vault & Account Switcher**:
  - Implemented `src/config/brand.ts`, `src/lib/gothwadSso.ts`, and `src/lib/accountMenuWidget.ts`.
  - Wired `/`, `/u/0..5/`, `?authuser=0..5`, and `/s/:shareId` routing plus `public/_redirects`.
  - Replaced persistent `localStorage` raw session storage with `MemoryStorage` + AES-256-GCM D1 vault hydration and `< 30ms` cached folder tree painting.
  - Integrated `window.GothwadAccountMenu` into `src/components/layout/Header.tsx` with clean MTProto client teardown on account switch.
- [x] **Phase 4 — Rebrand & Strict `<= 500` Line Modular Refactor**:
  - Split `PreviewModal.tsx`, `downloader.ts`, `Dashboard.tsx`, `App.tsx`, `index.css`, `useFiles.ts`, `radar.ts`, and `FileGrid.tsx` into focused modules so 100% of repository files are strictly `<= 500` lines.
  - Preserved backward compatibility for both `#GothwadDrive_v1` and `#TgCloudDrive_v1` supergroup signatures.
- [x] **Phase 5 — Automated Node 22 `node:sqlite` Test Suite & Documentation**:
  - Created `tests/drive.test.mjs` covering all 9 verification gates.
  - Updated `README.md`, `AGENTS.md`, `TASK.md`, and `HANDOVER.md`.
