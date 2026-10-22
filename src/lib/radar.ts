import { TelegramClient } from "@mtcute/web";
import { Long } from "@mtcute/core";
import {
  LS_DRIVE,
  hasDriveSignature,
} from "../config/telegram";
import type { DriveConfig } from "../types";
import { parseManifest } from "./manifest";
import {
  getBareChannelId,
  getMarkedChannelId,
  accessHashString,
  refreshDriveAccessHash,
  stampDriveSignature,
  ensureDriveForumEnabled,
  createDriveGroup,
} from "./radarSetup";

export { ensureDriveForumEnabled, createDriveGroup };

/** Explicit Blacklist numeric IDs provided in user screenshots */
const EXCLUDED_CHAT_IDS = new Set([
  "378392372",
  "-100378392372",
  "3886546063",
  "-1003886546063",
]);

async function verifyDriveGroup(
  client: TelegramClient,
  config: DriveConfig
): Promise<DriveConfig | null> {
  if (!config || !config.chatId) return null;
  const bareIdStr = String(getBareChannelId(config.chatId));
  const markedIdStr = getMarkedChannelId(config.chatId);

  if (EXCLUDED_CHAT_IDS.has(bareIdStr) || EXCLUDED_CHAT_IDS.has(markedIdStr)) {
    console.warn(`[radar] Explicitly blacklisted chat ID ${config.chatId}. Invalidating cache.`);
    return null;
  }

  const markedIdNum = Number(markedIdStr);

  try {
    const fullChat: any = await client.getFullChat(markedIdNum);
    if (fullChat) {
      const bio = fullChat.bio || "";
      const titleLower = (fullChat.title || config.chatTitle || "").toLowerCase();

      if (fullChat.isBroadcast && !fullChat.isForum && !fullChat.isMegagroup) {
        if (!titleLower.includes("drive") && !hasDriveSignature(bio)) {
          console.warn("[radar] Cached chat is a 1-way broadcast channel. Invalidating cache.");
          return null;
        }
      }

      const validTitleKeywords = [
        "gothwad drive", "gothwaddrive", "gothwad", "clash drive",
        "tg cloud drive", "clashdrive", "tg cloud", "drive", "cloud", "vault",
      ];
      const isTitleValid = validTitleKeywords.some((kw) => titleLower.includes(kw));

      if (!isTitleValid && !hasDriveSignature(bio)) {
        console.warn(`[radar] Cached chat "${titleLower}" lacks valid title and signature. Invalidating cache.`);
        return null;
      }

      if (!hasDriveSignature(bio)) {
        await stampDriveSignature(client, config.chatId, config.accessHash, bio);
      }
      return refreshDriveAccessHash(client, {
        ...config,
        chatId: markedIdStr,
        chatTitle: fullChat.title || config.chatTitle,
      });
    }
  } catch (err) {
    console.warn("verifyDriveGroup getFullChat failed:", err);
  }

  try {
    const bareId = getBareChannelId(config.chatId);
    const channelInput = {
      _: "inputChannel" as const,
      channelId: bareId,
      accessHash: Long.fromString(config.accessHash || "0"),
    };
    const full: any = await client.call({
      _: "channels.getFullChannel",
      channel: channelInput,
    });
    if (full && full.fullChat) {
      const about = full.fullChat.about ?? "";
      if (!hasDriveSignature(about)) {
        await stampDriveSignature(client, config.chatId, config.accessHash, about);
      }
      return refreshDriveAccessHash(client, { ...config, chatId: markedIdStr });
    }
  } catch (err) {
    console.warn("verifyDriveGroup fallback failed:", err);
  }

  return null;
}

/**
 * Scan the user's dialogs looking for an existing drive group.
 * Recognizes both `#GothwadDrive_v1` and `#TgCloudDrive_v1` signatures.
 */
export async function scanForDriveGroup(
  client: TelegramClient
): Promise<DriveConfig | null> {
  let userId = "default";
  try {
    const me = await client.getMe();
    if (me) userId = me.id.toString();
  } catch (e) {
    console.warn("Failed to fetch user in radar scan:", e);
  }
  const userDriveKey = `${LS_DRIVE}_${userId}`;

  const cached = localStorage.getItem(userDriveKey) || localStorage.getItem(LS_DRIVE);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as DriveConfig;
      if (parsed && parsed.chatId) {
        const bareIdStr = String(getBareChannelId(parsed.chatId));
        const markedIdStr = getMarkedChannelId(parsed.chatId);
        if (EXCLUDED_CHAT_IDS.has(bareIdStr) || EXCLUDED_CHAT_IDS.has(markedIdStr)) {
          localStorage.removeItem(userDriveKey);
          localStorage.removeItem(LS_DRIVE);
        } else {
          const verified = await verifyDriveGroup(client, parsed);
          if (verified) {
            localStorage.setItem(userDriveKey, JSON.stringify(verified));
            return verified;
          }
        }
      }
    } catch {
      localStorage.removeItem(userDriveKey);
      localStorage.removeItem(LS_DRIVE);
    }
  }

  const dialogs: any[] = [];
  try {
    for await (const dialog of client.iterDialogs({ limit: 500 })) {
      dialogs.push(dialog);
    }
  } catch (err) {
    console.warn("Failed to fetch main dialogs during radar scan:", err);
  }
  try {
    for await (const dialog of client.iterDialogs({ limit: 200, folder: 1 })) {
      dialogs.push(dialog);
    }
  } catch {
    // archived folder might fail
  }

  const TITLE_KEYWORDS = [
    "gothwad drive", "gothwaddrive", "gothwad", "clash drive",
    "tg cloud drive", "clashdrive", "tg cloud", "drive", "cloud", "storage", "vault",
  ];
  const titleCandidates: any[] = [];

  for (const dialog of dialogs) {
    const chat = (dialog as any).chat || (dialog as any).peer;
    if (!chat) continue;

    const bareIdStr = String(getBareChannelId(chat.id));
    const markedIdStr = getMarkedChannelId(chat.id);
    if (EXCLUDED_CHAT_IDS.has(bareIdStr) || EXCLUDED_CHAT_IDS.has(markedIdStr)) {
      continue;
    }

    const titleLower = (chat.title || "").toLowerCase();
    if (chat.chatType === "user" || chat.type === "user") continue;

    const isMegagroup = Boolean(
      chat.isMegagroup || chat.megagroup || chat.raw?.megagroup || chat.isForum || chat.raw?.forum
    );
    const isChannelType = chat.chatType === "channel" || chat.type === "channel";
    if (isChannelType && !isMegagroup) {
      continue;
    }

    if (titleLower.includes("clashgram") || titleLower.includes("update channel")) {
      if (!titleLower.includes("drive")) continue;
    }

    const isTitleMatch = TITLE_KEYWORDS.some((kw) => titleLower.includes(kw));
    const isForum = Boolean(chat.isForum || (chat.raw && "forum" in chat.raw && chat.raw.forum));

    if (isTitleMatch || isForum) {
      titleCandidates.push(chat);
    }
  }

  const scored: {
    config: DriveConfig;
    bareId: number;
    hasSignature: boolean;
    manifestCount: number;
    topicCount: number;
    titleOnly: boolean;
    score: number;
  }[] = [];

  for (const chat of titleCandidates) {
    try {
      const markedIdNum = Number(getMarkedChannelId(chat.id));
      await client.resolvePeer(markedIdNum).catch(() => null);
      let about = "";
      try {
        const full = await client.getFullChat(markedIdNum);
        about = full.bio || "";
      } catch {
        try {
          const bareId = getBareChannelId(chat.id);
          const ah = chat.raw?.accessHash || chat.inputPeer?.accessHash || Long.ZERO;
          const channelInput = {
            _: "inputChannel" as const,
            channelId: bareId,
            accessHash:
              typeof ah === "string"
                ? Long.fromString(ah)
                : typeof ah === "number"
                  ? Long.fromNumber(ah)
                  : ah || Long.ZERO,
          };
          const full: any = await client.call({
            _: "channels.getFullChannel",
            channel: channelInput,
          });
          about = full.fullChat?.about ?? "";
        } catch {
          // continue
        }
      }

      const hasSignature = hasDriveSignature(about);

      let topicCount = 0;
      try {
        const topics = await client.getForumTopics(markedIdNum).catch(() => []);
        topicCount = topics.length;
      } catch {
        // ignore
      }

      let manifestCount = 0;
      try {
        const bareId = getBareChannelId(chat.id);
        const ah = chat.raw?.accessHash || chat.inputPeer?.accessHash || Long.ZERO;
        const peerInput = {
          _: "inputPeerChannel" as const,
          channelId: bareId,
          accessHash:
            typeof ah === "string"
              ? Long.fromString(ah)
              : typeof ah === "number"
                ? Long.fromNumber(ah)
                : ah || Long.ZERO,
        };

        const topics = await client.getForumTopics(markedIdNum).catch(() => []);
        for (const topic of topics) {
          if (manifestCount > 0) break;
          try {
            const repliesRes: any = await client.call({
              _: "messages.getReplies",
              peer: peerInput,
              msgId: topic.id,
              offsetId: 0,
              offsetDate: 0,
              addOffset: 0,
              limit: 10,
              maxId: 0,
              minId: 0,
              hash: Long.ZERO,
            });
            for (const m of repliesRes.messages ?? []) {
              const text = typeof m.message === "string" ? m.message : typeof m.text === "string" ? m.text : "";
              if (text && (text.includes('"segmented_file"') || parseManifest(text) !== null)) {
                manifestCount++;
              }
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }

      if (manifestCount === 0) {
        try {
          const history = await client.getHistory(markedIdNum, { limit: 30 });
          for (const msg of history) {
            const mAny = msg as any;
            const text = typeof mAny.message === "string" ? mAny.message : typeof msg.text === "string" ? msg.text : "";
            if (text && (text.includes('"segmented_file"') || parseManifest(text) !== null)) {
              manifestCount++;
            }
          }
        } catch {
          // ignore
        }
      }

      let score = 0;
      const titleLower = (chat.title || "").toLowerCase();

      if (hasSignature) {
        score += 1000000;
      }

      if (titleLower === "gothwad drive" || titleLower === "clash drive" || titleLower === "tg cloud drive") {
        score += 10000;
      } else if (titleLower.includes("gothwad drive") || titleLower.includes("clash drive") || titleLower.includes("tg cloud drive")) {
        score += 6000;
      } else if (titleLower.includes("tg cloud") || titleLower.includes("gothwaddrive") || titleLower.includes("clashdrive") || titleLower.includes("gothwad")) {
        score += 3000;
      } else if (titleLower.includes("drive") || titleLower.includes("cloud") || titleLower.includes("vault")) {
        score += 500;
      }

      if (manifestCount > 0) score += 5000 + manifestCount * 500;
      if (topicCount > 0) score += 2000 + topicCount * 100;

      const markedId = getMarkedChannelId(chat.id);
      const bareId = getBareChannelId(chat.id);
      const accessHashStr = accessHashString(
        chat.raw?.accessHash ?? chat.inputPeer?.accessHash ?? chat.accessHash
      );

      const config: DriveConfig = {
        chatId: markedId,
        chatTitle: chat.title || "Gothwad Drive",
        accessHash: accessHashStr,
      };

      scored.push({
        config,
        bareId,
        hasSignature,
        manifestCount,
        topicCount,
        titleOnly: !hasSignature && manifestCount === 0 && topicCount === 0,
        score,
      });
    } catch {
      continue;
    }
  }

  if (scored.length > 0) {
    scored.sort((a, b) => b.score - a.score || a.bareId - b.bareId);
    const bestCandidate = scored[0];
    let best = bestCandidate.config;
    best = await refreshDriveAccessHash(client, best);
    await ensureDriveForumEnabled(client, best);
    if (!bestCandidate.hasSignature) {
      await stampDriveSignature(client, best.chatId, best.accessHash);
    }
    localStorage.setItem(userDriveKey, JSON.stringify(best));
    return best;
  }

  return null;
}
