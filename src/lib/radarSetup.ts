import { TelegramClient } from "@mtcute/web";
import { Long } from "@mtcute/core";
import {
  DRIVE_SIGNATURE,
  DEFAULT_DRIVE_TITLE,
  LS_DRIVE,
  hasDriveSignature,
} from "../config/telegram";
import type { DriveConfig } from "../types";

export function getBareChannelId(idInput: string | number): number {
  const idStr = String(idInput);
  return Number(idStr.replace(/^-100/, "").replace(/^-/, ""));
}

export function getMarkedChannelId(idInput: string | number): string {
  const bare = getBareChannelId(idInput);
  return `-100${bare}`;
}

export function accessHashString(value: unknown): string {
  return value == null ? "0" : String(value);
}

export async function refreshDriveAccessHash(
  client: TelegramClient,
  config: DriveConfig
): Promise<DriveConfig> {
  const chatId = getMarkedChannelId(config.chatId);
  try {
    const peer: any = await client.resolvePeer(Number(chatId));
    if (peer?._ === "inputPeerChannel" && peer.accessHash != null) {
      return { ...config, chatId, accessHash: accessHashString(peer.accessHash) };
    }
  } catch (err) {
    console.warn("[radar] Could not refresh the drive access hash:", err);
  }
  return { ...config, chatId };
}

export async function stampDriveSignature(
  client: TelegramClient,
  chatId: string | number,
  accessHashStr: string,
  existingBio: string = ""
): Promise<void> {
  try {
    const bareId = getBareChannelId(chatId);
    const peerInput = {
      _: "inputPeerChannel" as const,
      channelId: bareId,
      accessHash: Long.fromString(accessHashStr || "0"),
    };
    const newAbout = existingBio && existingBio.trim()
      ? (hasDriveSignature(existingBio) ? existingBio : `${existingBio}\n${DRIVE_SIGNATURE}`)
      : `Personal cloud storage powered by Gothwad Drive.\n${DRIVE_SIGNATURE}`;

    await client.call({
      _: "messages.editChatAbout",
      peer: peerInput,
      about: newAbout,
    });
  } catch (err) {
    console.warn("[radar] Failed to stamp drive signature:", err);
  }
}

/**
 * Ensure forum topics are enabled on a drive group.
 */
export async function ensureDriveForumEnabled(
  client: TelegramClient,
  config: DriveConfig
): Promise<void> {
  try {
    const bareId = getBareChannelId(config.chatId);
    let accessHashStr = config.accessHash || "0";
    try {
      const peer: any = await client.resolvePeer(Number(config.chatId));
      if (peer?.accessHash) {
        accessHashStr = String(peer.accessHash);
      }
    } catch { /* ignore */ }

    const channelInput = {
      _: "inputChannel" as const,
      channelId: bareId,
      accessHash: Long.fromString(accessHashStr),
    };

    await (client.call as any)({
      _: "channels.toggleForum",
      channel: channelInput,
      enabled: true,
      tabs: false,
    });
  } catch (e) {
    console.warn("[radar] Failed to toggle forum on drive group:", e);
  }
}

/**
 * Create a new drive supergroup with forum topics enabled.
 */
export async function createDriveGroup(
  client: TelegramClient
): Promise<DriveConfig> {
  const result: any = await client.call({
    _: "channels.createChannel",
    title: DEFAULT_DRIVE_TITLE,
    about: `Personal cloud storage powered by Gothwad Drive.\n${DRIVE_SIGNATURE}`,
    megagroup: true,
    forum: true,
  });

  const chats = result.chats || [];
  const channel = chats[0];
  const accessHashStr = channel.accessHash ? channel.accessHash.toString() : "0";

  const markedId = getMarkedChannelId(channel.id);
  const bareId = getBareChannelId(channel.id);

  const peerInput = {
    _: "inputPeerChannel" as const,
    channelId: bareId,
    accessHash: Long.fromString(accessHashStr),
  };

  try {
    await client.call({
      _: "messages.editChatAbout",
      peer: peerInput,
      about: `Personal cloud storage powered by Gothwad Drive.\n${DRIVE_SIGNATURE}`,
    });
  } catch (e) {
    console.warn("Failed to set chat description in createDriveGroup:", e);
  }

  const channelInput = {
    _: "inputChannel" as const,
    channelId: bareId,
    accessHash: Long.fromString(accessHashStr),
  };

  try {
    await (client.call as any)({
      _: "channels.toggleForum",
      channel: channelInput,
      enabled: true,
      tabs: false,
    });
  } catch (e) {
    console.warn("Failed to toggle forum in createDriveGroup:", e);
  }

  const config: DriveConfig = {
    chatId: markedId,
    chatTitle: channel.title,
    accessHash: accessHashStr,
  };

  let userId = "default";
  try {
    const me = await client.getMe();
    if (me) userId = me.id.toString();
  } catch (e) {
    console.warn("Failed to fetch user in createDriveGroup:", e);
  }
  const userDriveKey = `${LS_DRIVE}_${userId}`;
  localStorage.setItem(userDriveKey, JSON.stringify(config));

  return config;
}
