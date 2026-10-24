import { useState } from "react";
import type { GothwadSsoUser, StartupState, VaultSyncState } from "../../types";
import { buildSsoSignInUrl, slotUrl } from "../../lib/gothwadSso";

interface StartupStatusViewProps {
  startupState: StartupState;
  ssoUser: GothwadSsoUser | null;
  authuser: number;
  onRetry: () => void;
  onImportLegacySession: () => Promise<boolean>;
  onExportLegacySession: () => string | null;
  onForceResetCorruptVault: () => void;
  onShowManualRelink: () => void;
}

export function StartupStatusView({
  startupState,
  ssoUser,
  authuser,
  onRetry,
  onImportLegacySession,
  onExportLegacySession,
  onForceResetCorruptVault,
  onShowManualRelink,
}: StartupStatusViewProps) {
  const [copiedBackup, setCopiedBackup] = useState(false);
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
  const [importingLegacy, setImportingLegacy] = useState(false);

  const handleCopyBackup = async () => {
    const raw = onExportLegacySession();
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      setCopiedBackup(true);
      window.setTimeout(() => setCopiedBackup(false), 2500);
    } catch {
      window.prompt("Copy your Telegram session backup string:", raw);
    }
  };

  const handleImportLegacy = async () => {
    setImportingLegacy(true);
    try {
      await onImportLegacySession();
    } finally {
      setImportingLegacy(false);
    }
  };

  if (startupState.phase === "identity_error") {
    const isRoutingHtml = startupState.errorKind === "routing_html";
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-md-background text-md-on-background">
        <div className="max-w-md w-full bg-md-surface-container rounded-2xl p-6 border border-md-outline-variant/30 shadow-lg space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center font-bold text-lg shrink-0">
              !
            </div>
            <div>
              <h2 className="text-base font-bold text-md-on-surface">
                {isRoutingHtml ? "API Route Configuration Required" : "Identity Service Temporarily Unavailable"}
              </h2>
              <p className="text-xs text-md-on-surface-variant">
                Error code: <span className="font-mono">{startupState.errorKind}</span>
              </p>
            </div>
          </div>

          <p className="text-xs text-md-on-surface-variant leading-relaxed">
            {startupState.errorMessage ||
              "Could not verify your Gothwad Technologies identity. Your cloud vault has not been modified and you have not been signed out."}
          </p>

          {isRoutingHtml && (
            <div className="p-3 rounded-xl bg-md-surface-container-high border border-md-outline-variant/30 text-[11px] text-md-on-surface-variant space-y-1">
              <p className="font-semibold text-md-on-surface">Cloudflare Routing Diagnosis:</p>
              <p>
                The browser received an HTML document from <code className="font-mono">/api/*</code> instead of JSON. Ensure the Cloudflare Worker route <code className="font-mono">drive.gothwadtech.com/api/*</code> is bound to the <code className="font-mono">drive</code> Worker.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onRetry}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#0494f4] hover:bg-[#0380d4] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Retry Identity Verification
            </button>
            <a
              href={buildSsoSignInUrl(slotUrl(authuser))}
              className="py-2.5 px-4 rounded-xl bg-md-surface-container-high hover:bg-md-surface-container-highest text-md-on-surface text-xs font-semibold transition-colors"
            >
              Open Gothwad Accounts
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (startupState.phase === "vault_error") {
    const isCorrupt = startupState.vaultCorrupt || startupState.errorKind === "corrupt_ciphertext";
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-md-background text-md-on-background">
        <div className="max-w-md w-full bg-md-surface-container rounded-2xl p-6 border border-md-outline-variant/30 shadow-lg space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 text-red-500 flex items-center justify-center font-bold text-lg shrink-0">
              !
            </div>
            <div>
              <h2 className="text-base font-bold text-md-on-surface">
                {isCorrupt ? "Encrypted Cloud Vault Protected" : "Cloud Vault Temporarily Unreachable"}
              </h2>
              <p className="text-xs text-md-on-surface-variant">
                Account: {ssoUser?.email || "Verified Account"}
              </p>
            </div>
          </div>

          <p className="text-xs text-md-on-surface-variant leading-relaxed">
            {startupState.errorMessage ||
              (isCorrupt
                ? "Your encrypted vault row exists in Cloudflare D1, but could not be decrypted with the current server key. To prevent data loss, your existing vault ciphertext is locked against automatic overwrite."
                : "Could not load your encrypted cloud vault due to a network or server error.")}
          </p>

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={onRetry}
              className="w-full py-2.5 px-4 rounded-xl bg-[#0494f4] hover:bg-[#0380d4] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Retry Loading Cloud Vault
            </button>

            {startupState.legacySessionAvailable && (
              <button
                type="button"
                onClick={() => void handleCopyBackup()}
                className="w-full py-2.5 px-4 rounded-xl bg-md-surface-container-high hover:bg-md-surface-container-highest text-md-on-surface text-xs font-semibold transition-colors cursor-pointer"
              >
                {copiedBackup ? "Copied Local Session Backup!" : "Copy Local Session Backup String"}
              </button>
            )}

            {isCorrupt && !confirmingOverwrite && (
              <button
                type="button"
                onClick={() => setConfirmingOverwrite(true)}
                className="w-full py-2 px-4 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 text-xs font-semibold transition-colors cursor-pointer"
              >
                Replace Unreadable Vault & Re-link Telegram...
              </button>
            )}

            {isCorrupt && confirmingOverwrite && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 space-y-2">
                <p className="text-[11px] text-red-400 font-medium">
                  Confirming this action will unlock the unreadable vault row in D1 and replace it when you sign in to Telegram again.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onForceResetCorruptVault}
                    className="flex-1 py-2 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Confirm Replace & Re-link
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingOverwrite(false)}
                    className="py-2 px-3 rounded-lg bg-md-surface-container-high text-md-on-surface text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (startupState.phase === "telegram_connecting") {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-md-background text-md-on-background">
        <div className="max-w-sm w-full bg-md-surface-container rounded-2xl p-6 border border-md-outline-variant/30 shadow-md text-center space-y-4">
          <div className="w-9 h-9 mx-auto rounded-full border-3 border-[#0494f4] border-t-transparent animate-spin" />
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-md-on-surface">Connecting Telegram MTProto Engine</h2>
            <p className="text-xs text-md-on-surface-variant">
              Restoring your encrypted cloud vault for {ssoUser?.email || "your account"}...
            </p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="py-2 px-4 rounded-xl bg-md-surface-container-high hover:bg-md-surface-container-highest text-md-on-surface text-xs font-semibold transition-colors cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (startupState.phase === "telegram_error") {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-md-background text-md-on-background">
        <div className="max-w-md w-full bg-md-surface-container rounded-2xl p-6 border border-md-outline-variant/30 shadow-lg space-y-4">
          <h2 className="text-base font-bold text-md-on-surface">
            Telegram Connection Timed Out
          </h2>
          <p className="text-xs text-md-on-surface-variant leading-relaxed">
            {startupState.errorMessage ||
              "Your encrypted cloud vault is safe, but the browser could not finish connecting to Telegram right now."}
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="w-full py-2.5 px-4 rounded-xl bg-[#0494f4] hover:bg-[#0380d4] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Reconnect Telegram Vault
            </button>
            <button
              type="button"
              onClick={onShowManualRelink}
              className="w-full py-2 px-4 rounded-xl bg-md-surface-container-high hover:bg-md-surface-container-highest text-md-on-surface text-xs font-semibold transition-colors cursor-pointer"
            >
              Link a Different Telegram Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (startupState.legacySessionAvailable) {
    return (
      <div className="max-w-md mx-auto mt-4 px-4">
        <div className="p-4 rounded-2xl bg-md-surface-container border border-[#0494f4]/30 flex flex-col gap-2.5">
          <p className="text-xs font-bold text-md-on-surface">
            Existing Local Telegram Session Detected
          </p>
          <p className="text-[11px] text-md-on-surface-variant leading-relaxed">
            A legacy Telegram session exists in this browser. To protect multi-account isolation, it was not imported automatically into <span className="font-semibold text-md-on-surface">{ssoUser?.email || "this account"}</span>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={importingLegacy}
              onClick={() => void handleImportLegacy()}
              className="py-2 px-3 rounded-xl bg-[#0494f4] hover:bg-[#0380d4] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {importingLegacy ? "Importing..." : "Link Local Session to This Account"}
            </button>
            <button
              type="button"
              onClick={() => void handleCopyBackup()}
              className="py-2 px-3 rounded-xl bg-md-surface-container-high text-md-on-surface text-xs font-semibold cursor-pointer"
            >
              {copiedBackup ? "Copied Backup!" : "Export Backup"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export function VaultSyncBanner({
  vaultSyncState,
  onRetrySave,
  onExportLegacySession,
}: {
  vaultSyncState: VaultSyncState;
  onRetrySave: () => Promise<boolean>;
  onExportLegacySession: () => string | null;
}) {
  const [copied, setCopied] = useState(false);

  if (!vaultSyncState.saveError) return null;

  const handleCopy = async () => {
    const raw = onExportLegacySession();
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy your Telegram session backup string:", raw);
    }
  };

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="text-md-on-surface">
        <span className="font-bold text-amber-500">Cloud Vault Sync Pending: </span>
        <span>{vaultSyncState.saveError}</span>
        {vaultSyncState.migrationPending && (
          <span className="ml-1 text-md-on-surface-variant">
            (Your local session copy has been preserved until cloud save succeeds.)
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={vaultSyncState.saving}
          onClick={() => void onRetrySave()}
          className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-bold cursor-pointer disabled:opacity-50"
        >
          {vaultSyncState.saving ? "Saving..." : "Retry Vault Save"}
        </button>
        {vaultSyncState.migrationPending && (
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="px-2.5 py-1 rounded-lg bg-md-surface-container-high text-md-on-surface font-semibold cursor-pointer"
          >
            {copied ? "Copied!" : "Backup Session"}
          </button>
        )}
      </div>
    </div>
  );
}
