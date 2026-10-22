import { test, describe } from "node:test";
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
          const row = stmt.get(...params);
          return row ?? null;
        },
        async all() {
          const stmt = sqliteDb.prepare(sql);
          const rows = stmt.all(...params);
          return { results: rows, success: true };
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

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name.startsWith(".") ||
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "coverage"
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

describe("Gothwad Drive v4.0 Verification Suite", async () => {
  const workerMod = await loadTsModule("worker/src/index.ts");
  const cryptoMod = await loadTsModule("worker/src/crypto.ts");
  const telegramMod = await loadTsModule("src/config/telegram.ts");
  const worker = workerMod.default;

  test("1. Remote-Safe SQL Verification (zero PRAGMA statements + clean SQLite execution)", () => {
    const sqlFiles = [
      "sql/00_d1_console_bootstrap.sql",
      "sql/01_drive_schema.sql",
    ];
    const db = new DatabaseSync(":memory:");

    for (const rel of sqlFiles) {
      const content = fs.readFileSync(path.join(ROOT_DIR, rel), "utf8");
      assert.equal(
        /\bPRAGMA\b/i.test(content),
        false,
        `${rel} must not contain any PRAGMA statements`
      );
      db.exec(content);
    }

    const schemaTs = fs.readFileSync(path.join(ROOT_DIR, "worker/src/schema.ts"), "utf8");
    const uncommentedSchemaTs = schemaTs.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.equal(
      /\bPRAGMA\b/i.test(uncommentedSchemaTs),
      false,
      "worker/src/schema.ts must not execute any PRAGMA statements"
    );

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => r.name);
    assert.ok(tables.includes("system_keys"), "system_keys table must exist");
    assert.ok(tables.includes("drive_vaults"), "drive_vaults table must exist");
    assert.ok(tables.includes("drive_shares"), "drive_shares table must exist");
  });

  test("2. AES-256-GCM Vault Encryption Round-Trip + User-Binding/Tamper Rejection", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(fs.readFileSync(path.join(ROOT_DIR, "sql/01_drive_schema.sql"), "utf8"));
    const db = createD1Mock(sqlite);
    const env = {
      DB: db,
      APP_DOMAIN: "gothwadtech.com",
      ACCOUNTS_API_URL: "https://api.gothwadtech.com",
      ACCOUNTS_WEB_URL: "https://accounts.gothwadtech.com",
      DRIVE_ENCRYPTION_KEY: "test-master-secret-key-for-gothwad-drive-v4",
    };

    const userId = "usr_test_12345";
    const mockSession = "1BVtsO8Bu5_mock_mtproto_session_string_payload_9876543210";

    const encrypted = await cryptoMod.encryptVaultSession(db, env, userId, mockSession);
    assert.ok(encrypted.ciphertextBase64.length > 20);
    assert.ok(encrypted.ivBase64.length > 8);
    assert.equal(encrypted.ciphertextBase64.includes(mockSession), false);

    const decrypted = await cryptoMod.decryptVaultSession(
      db,
      env,
      userId,
      encrypted.ciphertextBase64,
      encrypted.ivBase64,
      encrypted.keyVersion
    );
    assert.equal(decrypted, mockSession);

    // Wrong userId (HKDF per-user salt mismatch) must fail authentication and return null
    const wrongUserResult = await cryptoMod.decryptVaultSession(
      db,
      env,
      "usr_wrong_99999",
      encrypted.ciphertextBase64,
      encrypted.ivBase64,
      encrypted.keyVersion
    );
    assert.equal(wrongUserResult, null);

    // Tampered ciphertext must fail authentication and return null
    const tamperedBytes = Buffer.from(encrypted.ciphertextBase64, "base64");
    tamperedBytes[0] ^= 0xff;
    const tamperedResult = await cryptoMod.decryptVaultSession(
      db,
      env,
      userId,
      tamperedBytes.toString("base64"),
      encrypted.ivBase64,
      encrypted.keyVersion
    );
    assert.equal(tamperedResult, null);
  });

  test("3. Worker API /api/me + /api/drive/vault Lifecycle", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const env = {
      DB: createD1Mock(sqlite),
      APP_DOMAIN: "gothwadtech.com",
      ACCOUNTS_API_URL: "https://api.gothwadtech.com",
      ACCOUNTS_WEB_URL: "https://accounts.gothwadtech.com",
    };

    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, init) => {
        const cookie = new Headers(init?.headers).get("Cookie") || "";
        if (!cookie.includes("gothwad_sess_a=valid")) {
          return new Response(JSON.stringify({ authenticated: false }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            authenticated: true,
            user: {
              id: "usr_vault_01",
              email: "alice@gothwadtech.com",
              name: "Alice Gothwad",
            },
            accounts: [
              {
                id: "usr_vault_01",
                email: "alice@gothwadtech.com",
                name: "Alice Gothwad",
                authuser: 0,
              },
            ],
            activeId: "usr_vault_01",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      };

      // Unauthenticated GET /api/drive/vault -> 401
      const unauthRes = await worker.fetch(
        new Request("https://drive.gothwadtech.com/api/drive/vault"),
        env
      );
      assert.equal(unauthRes.status, 401);

      // Authenticated PUT /api/drive/vault
      const authHeaders = {
        Cookie: "gothwad_sess_a=valid; gothwad_active=a",
        Origin: "https://drive.gothwadtech.com",
        "Content-Type": "application/json",
      };
      const putRes = await worker.fetch(
        new Request("https://drive.gothwadtech.com/api/drive/vault", {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({
            tgSession: "1BVtsO8Bu5_real_session_payload_for_alice_123456",
            tgUserId: "99887766",
            tgPhone: "+919999999999",
            tgProfile: { id: "99887766", firstName: "Alice", phone: "+919999999999" },
            driveConfig: {
              version: 1,
              chatId: "-100123456789",
              chatTitle: "Gothwad Drive",
              folderMap: { Documents: 11 },
              createdAt: 1700000000,
            },
            topics: [{ id: 11, title: "Documents", date: 1700000000 }],
          }),
        }),
        env
      );
      assert.equal(putRes.status, 200);
      const putJson = await putRes.json();
      assert.equal(putJson.ok, true);
      assert.equal(putJson.hasVault, true);

      // Verify raw session string is encrypted in SQLite
      const rawRow = sqlite
        .prepare("SELECT encrypted_session FROM drive_vaults WHERE user_id = ?")
        .get("usr_vault_01");
      assert.ok(rawRow);
      assert.equal(
        String(rawRow.encrypted_session).includes("1BVtsO8Bu5_real_session_payload_for_alice_123456"),
        false
      );

      // Authenticated GET /api/drive/vault
      const getRes = await worker.fetch(
        new Request("https://drive.gothwadtech.com/api/drive/vault", {
          headers: { Cookie: "gothwad_sess_a=valid; gothwad_active=a" },
        }),
        env
      );
      assert.equal(getRes.status, 200);
      const getJson = await getRes.json();
      assert.equal(getJson.hasVault, true);
      assert.equal(getJson.vault.tgSession, "1BVtsO8Bu5_real_session_payload_for_alice_123456");
      assert.equal(getJson.vault.driveConfig.chatId, "-100123456789");
      assert.equal(getJson.vault.topics.length, 1);
      assert.equal(getJson.vault.topics[0].title, "Documents");

      // Authenticated DELETE /api/drive/vault
      const delRes = await worker.fetch(
        new Request("https://drive.gothwadtech.com/api/drive/vault", {
          method: "DELETE",
          headers: authHeaders,
        }),
        env
      );
      assert.equal(delRes.status, 200);

      const getAfterDel = await worker.fetch(
        new Request("https://drive.gothwadtech.com/api/drive/vault", {
          headers: { Cookie: "gothwad_sess_a=valid; gothwad_active=a" },
        }),
        env
      );
      const afterDelJson = await getAfterDel.json();
      assert.equal(afterDelJson.hasVault, false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("4. Worker API /api/drive/shares Lifecycle (Create + Public Resolve + Download Counter)", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const env = {
      DB: createD1Mock(sqlite),
      APP_DOMAIN: "gothwadtech.com",
      ACCOUNTS_API_URL: "https://api.gothwadtech.com",
      ACCOUNTS_WEB_URL: "https://accounts.gothwadtech.com",
    };

    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            authenticated: true,
            user: { id: "usr_share_01", email: "bob@gothwadtech.com", name: "Bob" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      const createRes = await worker.fetch(
        new Request("https://drive.gothwadtech.com/api/drive/shares", {
          method: "POST",
          headers: {
            Cookie: "gothwad_sess_a=valid",
            Origin: "https://drive.gothwadtech.com",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: "architecture-spec.pdf",
            fileSize: 2097152,
            mimeType: "application/pdf",
            chatId: "-100999888777",
            topicId: 42,
            manifest: {
              type: "segmented_file",
              fileName: "architecture-spec.pdf",
              fileSize: 2097152,
              chunks: [501, 502],
            },
          }),
        }),
        env
      );
      assert.equal(createRes.status, 201);
      const created = await createRes.json();
      assert.equal(created.ok, true);
      const shareId = created.id || created.share?.id;
      assert.ok(shareId && shareId.length >= 6);

      // Public GET /api/drive/shares/:id (signed-out user can resolve metadata)
      const get1 = await worker.fetch(
        new Request(`https://drive.gothwadtech.com/api/drive/shares/${shareId}`),
        env
      );
      assert.equal(get1.status, 200);
      const get1Json = await get1.json();
      assert.equal(get1Json.ok, true);
      assert.equal(get1Json.share.fileName, "architecture-spec.pdf");
      assert.equal(get1Json.share.downloads, 1);

      const get2 = await worker.fetch(
        new Request(`https://drive.gothwadtech.com/api/drive/shares/${shareId}`),
        env
      );
      const get2Json = await get2.json();
      assert.equal(get2Json.share.downloads, 2);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("5. Upstream Set-Cookie Multi-Header Forwarding", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const env = {
      DB: createD1Mock(sqlite),
      APP_DOMAIN: "gothwadtech.com",
      ACCOUNTS_API_URL: "https://api.gothwadtech.com",
      ACCOUNTS_WEB_URL: "https://accounts.gothwadtech.com",
    };

    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        const headers = new Headers({ "Content-Type": "application/json" });
        headers.append("Set-Cookie", "gothwad_active=b; Domain=.gothwadtech.com; Path=/; Secure; HttpOnly");
        headers.append("Set-Cookie", "gothwad_sess_b=rotated_tok; Domain=.gothwadtech.com; Path=/; Secure; HttpOnly");
        headers.append("Set-Cookie", "unrelated_cookie=ignore_me; Path=/");
        return new Response(
          JSON.stringify({
            authenticated: true,
            user: { id: "usr_b", email: "b@gothwadtech.com" },
            activeId: "usr_b",
          }),
          { status: 200, headers }
        );
      };

      const res = await worker.fetch(
        new Request("https://drive.gothwadtech.com/api/me", {
          headers: { Cookie: "gothwad_sess_b=old_tok" },
        }),
        env
      );
      assert.equal(res.status, 200);
      const cookies = res.headers.getSetCookie();
      assert.equal(cookies.length, 2);
      assert.ok(cookies.some((c) => c.startsWith("gothwad_active=b")));
      assert.ok(cookies.some((c) => c.startsWith("gothwad_sess_b=rotated_tok")));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("6. CSRF Origin Protection rejects untrusted origins with 403", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const env = {
      DB: createD1Mock(sqlite),
      APP_DOMAIN: "gothwadtech.com",
      ACCOUNTS_API_URL: "https://api.gothwadtech.com",
      ACCOUNTS_WEB_URL: "https://accounts.gothwadtech.com",
    };

    const res = await worker.fetch(
      new Request("https://drive.gothwadtech.com/api/drive/vault", {
        method: "DELETE",
        headers: {
          Origin: "https://evil.example.com",
          Cookie: "gothwad_sess_a=valid",
        },
      }),
      env
    );
    assert.equal(res.status, 403);
  });

  test("7. File Line-Count Gate (100% of repo files strictly <= 500 lines)", () => {
    const allowedExt = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".sql", ".toml", ".md"]);
    const allFiles = walkFiles(ROOT_DIR).filter((f) => allowedExt.has(path.extname(f)));
    assert.ok(allFiles.length > 30, "Should scan all repository source and doc files");

    const violations = [];
    for (const file of allFiles) {
      const rel = path.relative(ROOT_DIR, file);
      const lines = fs.readFileSync(file, "utf8").split("\n");
      // Trailing newline in POSIX files adds 1 empty element after the final \n
      const lineCount = lines.at(-1) === "" ? lines.length - 1 : lines.length;
      if (lineCount > 500) {
        violations.push(`${rel}: ${lineCount} lines`);
      }
    }
    assert.deepEqual(violations, [], `Files exceeding 500 lines:\n${violations.join("\n")}`);
  });

  test("8. Pure-English Gate (Rule #0: zero Devanagari or Hinglish tokens)", () => {
    const allowedExt = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".sql", ".toml", ".md"]);
    const allFiles = walkFiles(ROOT_DIR).filter(
      (f) => allowedExt.has(path.extname(f)) && path.basename(f) !== "drive.test.mjs"
    );
    const devanagariRegex = /[\u0900-\u097F]/;
    const bannedWordsRegex = /\b(Atmanirbhar|atmanirbhar|namaste|karo|kya|nahi|bhai|accha|theek|chalo|dekho|samajh)\b/i;

    const violations = [];
    for (const file of allFiles) {
      const rel = path.relative(ROOT_DIR, file);
      const text = fs.readFileSync(file, "utf8");
      if (devanagariRegex.test(text)) {
        violations.push(`${rel}: contains Devanagari script`);
      }
      const match = text.match(bannedWordsRegex);
      if (match) {
        violations.push(`${rel}: contains banned non-English token "${match[0]}"`);
      }
    }
    assert.deepEqual(violations, [], `Rule #0 English-only violations:\n${violations.join("\n")}`);
  });

  test("9. Legacy & v4 Signature Compatibility (#GothwadDrive_v1 and #TgCloudDrive_v1)", () => {
    assert.equal(telegramMod.hasDriveSignature("My Cloud Vault\n#GothwadDrive_v1"), true);
    assert.equal(telegramMod.hasDriveSignature("Legacy Drive\n#TgCloudDrive_v1"), true);
    assert.equal(telegramMod.hasDriveSignature("Unrelated Group Chat"), false);
    assert.equal(telegramMod.hasDriveSignature(null), false);
  });
});
