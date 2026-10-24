import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

async function loadTsModule(entryRelPath) {
  const entry = path.join(ROOT_DIR, entryRelPath);
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const code = result.outputFiles[0].text;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(dataUrl);
}

function createD1Mock(sqliteDb) {
  return {
    prepare(sql) {
      const makeBound = (params = []) => ({
        bind(...nextParams) {
          return makeBound(nextParams);
        },
        async first() {
          const stmt = sqliteDb.prepare(sql);
          return stmt.get(...params) ?? null;
        },
        async all() {
          const stmt = sqliteDb.prepare(sql);
          return { results: stmt.all(...params), success: true };
        },
        async run() {
          const stmt = sqliteDb.prepare(sql);
          const info = stmt.run(...params);
          return { success: true, meta: { changes: info.changes } };
        },
      });
      return makeBound([]);
    },
  };
}

function createStorageMock() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe("Gothwad Drive Behavioral & Resilience Regression Suite", async () => {
  const localStorageMock = createStorageMock();
  const sessionStorageMock = createStorageMock();
  globalThis.localStorage = localStorageMock;
  globalThis.sessionStorage = sessionStorageMock;
  globalThis.window = {
    location: {
      href: "https://drive.gothwadtech.com/u/0/",
      pathname: "/u/0/",
      search: "",
      origin: "https://drive.gothwadtech.com",
    },
    localStorage: localStorageMock,
    sessionStorage: sessionStorageMock,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };

  const workerMod = await loadTsModule("worker/src/index.ts");
  const cryptoMod = await loadTsModule("worker/src/crypto.ts");
  const ssoMod = await loadTsModule("src/lib/gothwadSso.ts");
  const dbMod = await loadTsModule("src/lib/db.ts");
  const authHelpersMod = await loadTsModule("src/lib/authHelpers.ts");
  const worker = workerMod.default;

  beforeEach(() => {
    localStorageMock.clear();
    sessionStorageMock.clear();
  });

  test("1. Truthful Identity & Routing Classification (HTML, 503, 429, Redirect, Malformed JSON, Timeout, Offline vs Confirmed Anonymous)", async () => {
    const origFetch = globalThis.fetch;
    try {
      // 1a. HTML catch-all response (/api/drive/bootstrap returning SPA index.html)
      globalThis.fetch = async () =>
        new Response("<!doctype html><html><body>SPA Fallback</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      const htmlBoot = await ssoMod.fetchDriveBootstrap(0);
      assert.equal(htmlBoot.phase, "identity_error");
      assert.equal(htmlBoot.authenticated, false);
      assert.equal(htmlBoot.errorKind, "routing_html");

      // 1b. HTTP 503 service unavailable
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: "accounts_unavailable", message: "Upstream down" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      const err503 = await ssoMod.fetchDriveBootstrap(0);
      assert.equal(err503.phase, "identity_error");
      assert.equal(err503.errorKind, "http_5xx");

      // 1c. HTTP 429 rate limited
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      const err429 = await ssoMod.fetchDriveBootstrap(0);
      assert.equal(err429.phase, "identity_error");
      assert.equal(err429.errorKind, "rate_limited");

      // 1d. Unexpected 302 redirect
      globalThis.fetch = async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://accounts.gothwadtech.com/" },
        });
      const errRedirect = await ssoMod.fetchDriveBootstrap(0);
      assert.equal(errRedirect.phase, "identity_error");
      assert.equal(errRedirect.errorKind, "redirect");

      // 1e. Malformed JSON body
      globalThis.fetch = async () =>
        new Response("{not-valid-json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      const errJson = await ssoMod.fetchDriveBootstrap(0);
      assert.equal(errJson.phase, "identity_error");
      assert.equal(errJson.errorKind, "malformed_json");

      // 1f. Offline / network error
      globalThis.fetch = async () => {
        throw new TypeError("Failed to fetch");
      };
      const errNet = await ssoMod.fetchDriveBootstrap(0);
      assert.equal(errNet.phase, "identity_error");
      assert.equal(errNet.errorKind, "network");

      // 1g. Hung request bounded by timeoutMs
      globalThis.fetch = (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal.reason || new DOMException("Aborted", "AbortError"));
          });
        });
      const errTimeout = await ssoMod.fetchDriveBootstrap(0, { timeoutMs: 35 });
      assert.equal(errTimeout.phase, "identity_error");
      assert.equal(errTimeout.errorKind, "timeout");

      // 1h. Confirmed anonymous (200 { authenticated: false } and 401)
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ ok: true, authenticated: false, user: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      const anon200 = await ssoMod.fetchDriveBootstrap(0);
      assert.equal(anon200.phase, "anonymous");
      assert.equal(anon200.errorKind, "none");

      globalThis.fetch = async () =>
        new Response(JSON.stringify({ ok: false, authenticated: false }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      const anon401 = await ssoMod.fetchDriveBootstrap(0);
      assert.equal(anon401.phase, "anonymous");
      assert.equal(anon401.errorKind, "none");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("2. Single-Identity-Verification Bootstrap (/api/drive/bootstrap) & Multi-Cookie Forwarding", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(fs.readFileSync(path.join(ROOT_DIR, "sql/01_drive_schema.sql"), "utf8"));
    const db = createD1Mock(sqlite);
    const env = {
      DB: db,
      APP_DOMAIN: "drive.gothwadtech.com",
      ACCOUNTS_API_URL: "https://api.gothwadtech.com",
      DRIVE_ENCRYPTION_KEY: "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff",
    };

    let upstreamCalls = 0;
    const mockUpstream = async () => {
      upstreamCalls++;
      const headers = new Headers({ "Content-Type": "application/json" });
      headers.append("Set-Cookie", "gothwad_sess_a=rot1; Path=/; HttpOnly; Secure");
      headers.append("Set-Cookie", "gothwad_active=a; Path=/; HttpOnly; Secure");
      return new Response(
        JSON.stringify({
          authenticated: true,
          activeId: "usr_boot_1",
          authuser: 0,
          user: { id: "usr_boot_1", username: "bootuser", email: "bootuser@gothwad.in", name: "Boot User" },
          accounts: [{ id: "usr_boot_1", authuser: 0, username: "bootuser", email: "bootuser@gothwad.in" }],
        }),
        { status: 200, headers }
      );
    };

    // Save a vault first
    const putReq = new Request("https://drive.gothwadtech.com/api/drive/vault", {
      method: "PUT",
      headers: {
        Origin: "https://drive.gothwadtech.com",
        Cookie: "gt_access=tok",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: "1BVtsO_valid_mtproto_session_payload_for_bootstrap_test",
        tgUserId: "777001",
        driveConfig: { chatId: "-100999888", chatTitle: "Gothwad Drive", accessHash: "12345" },
        folders: [{ id: 1, title: "General", iconColor: 1, date: 1000, messageCount: 0 }],
      }),
    });
    const putRes = await worker.fetch(putReq, env, undefined, mockUpstream);
    assert.equal(putRes.status, 200);

    // Reset counter and call GET /api/drive/bootstrap
    upstreamCalls = 0;
    const bootReq = new Request("https://drive.gothwadtech.com/api/drive/bootstrap", {
      method: "GET",
      headers: { Cookie: "gt_access=old" },
    });
    const bootRes = await worker.fetch(bootReq, env, undefined, mockUpstream);
    assert.equal(bootRes.status, 200);
    assert.equal(upstreamCalls, 1, "GET /api/drive/bootstrap must verify identity with Accounts exactly once");
    assert.equal(bootRes.headers.getSetCookie().length, 2, "Must forward all rotated Set-Cookie headers");

    const bootBody = await bootRes.json();
    assert.equal(bootBody.authenticated, true);
    assert.equal(bootBody.user.id, "usr_boot_1");
    assert.equal(bootBody.vaultStatus, "ok");
    assert.equal(bootBody.vault.session, "1BVtsO_valid_mtproto_session_payload_for_bootstrap_test");
  });

  test("3. Vault Decryption vs Missing Vault & Corrupted Ciphertext Preservation (409 vault_corrupt_locked + v1/v2 Compat)", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(fs.readFileSync(path.join(ROOT_DIR, "sql/01_drive_schema.sql"), "utf8"));
    const db = createD1Mock(sqlite);
    const keyA = "aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff66660000777788889999";
    const keyB = "99998888777700006666ffff5555eeee4444dddd3333cccc2222bbbb1111aaaa";

    const mockAuth = async () =>
      new Response(
        JSON.stringify({
          authenticated: true,
          user: { id: "usr_corrupt_test", username: "corruptuser" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    // 3a. Missing vault row returns vaultStatus: 'missing'
    const emptyRes = await worker.fetch(
      new Request("https://drive.gothwadtech.com/api/drive/bootstrap", {
        headers: { Cookie: "gt_access=tok" },
      }),
      { DB: db, DRIVE_ENCRYPTION_KEY: keyA },
      undefined,
      mockAuth
    );
    const emptyBody = await emptyRes.json();
    assert.equal(emptyBody.vaultStatus, "missing");
    assert.equal(emptyBody.hasVault, false);
    assert.equal(emptyBody.vaultCorrupt, false);

    // 3b. Save valid vault under keyA
    const secretSession = "1BVtsO_precious_encrypted_session_must_never_be_lost";
    await worker.fetch(
      new Request("https://drive.gothwadtech.com/api/drive/vault", {
        method: "PUT",
        headers: {
          Origin: "https://drive.gothwadtech.com",
          Cookie: "gt_access=tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session: secretSession, tgUserId: "555111" }),
      }),
      { DB: db, DRIVE_ENCRYPTION_KEY: keyA },
      undefined,
      mockAuth
    );

    // 3c. Reading under wrong keyB returns vaultStatus: 'corrupt' and preserves ciphertext in D1
    const corruptRes = await worker.fetch(
      new Request("https://drive.gothwadtech.com/api/drive/bootstrap", {
        headers: { Cookie: "gt_access=tok" },
      }),
      { DB: db, DRIVE_ENCRYPTION_KEY: keyB },
      undefined,
      mockAuth
    );
    const corruptBody = await corruptRes.json();
    assert.equal(corruptBody.vaultStatus, "corrupt");
    assert.equal(corruptBody.vaultCorrupt, true);
    assert.equal(corruptBody.hasVault, false);

    // 3d. Attempting PUT /api/drive/vault under keyB without overwriteCorrupt:true is rejected with 409 vault_corrupt_locked
    const blockedPut = await worker.fetch(
      new Request("https://drive.gothwadtech.com/api/drive/vault", {
        method: "PUT",
        headers: {
          Origin: "https://drive.gothwadtech.com",
          Cookie: "gt_access=tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session: "1BVtsO_accidental_overwrite_attempt_session" }),
      }),
      { DB: db, DRIVE_ENCRYPTION_KEY: keyB },
      undefined,
      mockAuth
    );
    assert.equal(blockedPut.status, 409);
    const blockedBody = await blockedPut.json();
    assert.equal(blockedBody.error, "vault_corrupt_locked");

    // 3e. Restoring keyA still decrypts the original preserved ciphertext!
    const restoredRes = await worker.fetch(
      new Request("https://drive.gothwadtech.com/api/drive/bootstrap", {
        headers: { Cookie: "gt_access=tok" },
      }),
      { DB: db, DRIVE_ENCRYPTION_KEY: keyA },
      undefined,
      mockAuth
    );
    const restoredBody = await restoredRes.json();
    assert.equal(restoredBody.vaultStatus, "ok");
    assert.equal(restoredBody.vault.session, secretSession);

    // 3f. Backward compatibility with VAULT_MASTER_KEY env binding
    const compatDecrypted = await cryptoMod.decryptVaultSession(
      db,
      { VAULT_MASTER_KEY: keyA },
      "usr_corrupt_test",
      sqlite.prepare("SELECT encrypted_session FROM drive_vaults WHERE user_id = ?").get("usr_corrupt_test").encrypted_session,
      sqlite.prepare("SELECT session_iv FROM drive_vaults WHERE user_id = ?").get("usr_corrupt_test").session_iv,
      2
    );
    assert.equal(compatDecrypted, secretSession);
  });

  test("4. Confirmed Vault Save & Safe Legacy Session Cleanup (Never Scrub Before Save Succeeds)", async () => {
    const origFetch = globalThis.fetch;
    try {
      const legacySession = "1BVtsO_legacy_local_session_string_requiring_safe_migration_999";
      localStorageMock.setItem("tgcd_session", legacySession);
      ssoMod.tagPendingLegacySessionOwner("usr_migrate_1", "888111");

      // Inspect for owning user
      const inspectOwner = ssoMod.inspectLegacyLocalSession("usr_migrate_1");
      assert.equal(inspectOwner.ownedByCurrentUser, true);
      assert.equal(inspectOwner.session, legacySession);

      // Simulate failed saveDriveVaultDetailed (503)
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: "vault_unavailable", message: "D1 busy" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      const failedSave = await ssoMod.saveDriveVaultDetailed(
        { session: legacySession, tgUserId: "888111", expectedUserId: "usr_migrate_1" },
        0
      );
      assert.equal(failedSave.ok, false);
      assert.equal(
        localStorageMock.getItem("tgcd_session"),
        legacySession,
        "Legacy session MUST remain intact when saveDriveVaultDetailed fails"
      );

      // Now simulate confirmed save success (200) followed by scrubRawSessionFromLocalStorage
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ ok: true, vaultStatus: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      const okSave = await ssoMod.saveDriveVaultDetailed(
        { session: legacySession, tgUserId: "888111", expectedUserId: "usr_migrate_1" },
        0
      );
      assert.equal(okSave.ok, true);
      ssoMod.scrubRawSessionFromLocalStorage();
      assert.equal(localStorageMock.getItem("tgcd_session"), null);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("5. Strict Multi-Account Isolation (IndexedDB Scope, Legacy Session Ownership & 409 account_mismatch)", async () => {
    // 5a. IndexedDB topic key isolation between Gothwad Account A and Account B
    dbMod.setActiveStorageScope({ gothwadUserId: "usr_A", tgUserId: "tg_1", chatId: "-100111" });
    const keyA = dbMod.buildScopedTopicKey(11);
    dbMod.setActiveStorageScope({ gothwadUserId: "usr_B", tgUserId: "tg_2", chatId: "-100222" });
    const keyB = dbMod.buildScopedTopicKey(11);
    assert.notEqual(keyA, keyB);
    assert.equal(keyA, "usr_A:tg_1:-100111:11");
    assert.equal(keyB, "usr_B:tg_2:-100222:11");

    // 5b. Legacy session tagged for usr_A must NOT be readable or auto-imported by usr_B
    localStorageMock.setItem("tgcd_session", "1BVtsO_account_A_private_telegram_session_string_000");
    ssoMod.tagPendingLegacySessionOwner("usr_A", "tg_1");
    const inspectForB = ssoMod.inspectLegacyLocalSession("usr_B");
    assert.equal(inspectForB.ownedByOtherUser, true);
    assert.equal(inspectForB.session, null, "Account B must never receive Account A's legacy session");

    // 5c. Worker rejects stale Account-A PUT / DELETE when active session is Account-B (409 account_mismatch)
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(fs.readFileSync(path.join(ROOT_DIR, "sql/01_drive_schema.sql"), "utf8"));
    const db = createD1Mock(sqlite);
    const mockAuthAsB = async () =>
      new Response(
        JSON.stringify({ authenticated: true, user: { id: "usr_B", username: "userb" } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const stalePutFromA = await worker.fetch(
      new Request("https://drive.gothwadtech.com/api/drive/vault", {
        method: "PUT",
        headers: {
          Origin: "https://drive.gothwadtech.com",
          Cookie: "gt_access=tok",
          "Content-Type": "application/json",
          "X-Gothwad-Expect-User": "usr_A",
        },
        body: JSON.stringify({ session: "1BVtsO_account_A_session_must_not_land_in_B" }),
      }),
      { DB: db },
      undefined,
      mockAuthAsB
    );
    assert.equal(stalePutFromA.status, 409);
    const staleBody = await stalePutFromA.json();
    assert.equal(staleBody.error, "account_mismatch");
  });

  test("6. Bounded Timeouts, Cancellation & Non-Destructive Sign-Out Guarantees", async () => {
    // 6a. withBoundedTimeout rejects promptly on timeout
    await assert.rejects(
      () =>
        authHelpersMod.withBoundedTimeout(
          new Promise(() => {}),
          25,
          "Telegram connection timed out"
        ),
      /Telegram connection timed out/
    );

    // 6b. withBoundedTimeout aborts immediately when AbortController signals
    const ctrl = new AbortController();
    const pending = authHelpersMod.withBoundedTimeout(
      new Promise(() => {}),
      5000,
      "Should abort first",
      ctrl.signal
    );
    ctrl.abort();
    await assert.rejects(() => pending, /Abort/);

    // 6c. Verify App.tsx never calls deleteDriveVault/unlinkDriveVault inside handleLogout or SSO sign-out
    const appSource = fs.readFileSync(path.join(ROOT_DIR, "src/App.tsx"), "utf8");
    const logoutMatch = appSource.match(/const handleLogout = useCallback\([\s\S]*?\}, \[[\s\S]*?\]\);/);
    assert.ok(logoutMatch, "handleLogout must exist in src/App.tsx");
    assert.equal(
      /unlinkDriveVault|deleteDriveVault/.test(logoutMatch[0]),
      false,
      "handleLogout must NOT delete or unlink the remote D1 cloud vault"
    );

    const signOutSlotMatch = appSource.match(/const handleSignOutSsoSlot = useCallback\([\s\S]*?\}, \[[\s\S]*?\]\);/);
    assert.ok(signOutSlotMatch, "handleSignOutSsoSlot must exist in src/App.tsx");
    assert.equal(
      /unlinkDriveVault|deleteDriveVault/.test(signOutSlotMatch[0]),
      false,
      "handleSignOutSsoSlot must NOT delete or unlink the remote D1 cloud vault"
    );
  });
});
