/**
 * =============================================================================
 * GOTHWAD DRIVE — CENTRAL DOMAIN-AGNOSTIC BRAND & ENDPOINT CONFIGURATION
 * Change `DEFAULT_APP_DOMAIN` (or set `VITE_APP_DOMAIN`) to rebrand the entire
 * ecosystem domain across SSO, API endpoints, share links, and account menus.
 * =============================================================================
 */

export const DEFAULT_APP_DOMAIN = "gothwadtech.com";

function readViteEnv(key: string): string {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env) {
      const val = (import.meta.env as Record<string, unknown>)[key];
      if (typeof val === "string" && val.trim()) return val.trim();
    }
  } catch {
    // ignore
  }
  return "";
}

export const APP_DOMAIN = (readViteEnv("VITE_APP_DOMAIN") || DEFAULT_APP_DOMAIN)
  .toLowerCase()
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

export const BRAND_NAME = "Gothwad Drive";
export const BRAND_SHORT_NAME = "Drive";
export const ECOSYSTEM_NAME = "Gothwad";

export const DRIVE_ORIGIN = `https://drive.${APP_DOMAIN}`;
export const DRIVE_WEB_ORIGIN = DRIVE_ORIGIN;

export const ACCOUNTS_WEB_ORIGIN = (
  readViteEnv("VITE_ACCOUNTS_WEB_URL") || `https://accounts.${APP_DOMAIN}`
).replace(/\/+$/, "");

export const ACCOUNTS_API_ORIGIN = (
  readViteEnv("VITE_ACCOUNTS_API_URL") || `https://api.${APP_DOMAIN}`
).replace(/\/+$/, "");

export const ACCOUNT_WIDGET_URL = `${ACCOUNTS_WEB_ORIGIN}/widget/account-menu.js`;

export function formatGothwadEmail(username: string, domain = APP_DOMAIN): string {
  const clean = String(username || "").trim().toLowerCase();
  if (!clean) return "";
  return clean.includes("@") ? clean : `${clean}@${domain}`;
}

export function buildAccountSlotPath(authuser: number): string {
  const slot = Number.isInteger(authuser) && authuser >= 0 && authuser <= 5 ? authuser : 0;
  return `/u/${slot}/`;
}

export function parseAuthuserFromUrl(
  pathname = typeof window !== "undefined" ? window.location.pathname : "/",
  search = typeof window !== "undefined" ? window.location.search : ""
): { authuser: number; hasExplicitSlot: boolean } {
  const pathMatch = pathname.match(/^\/u\/([0-5])(?:\/|$)/);
  if (pathMatch) {
    return { authuser: Number.parseInt(pathMatch[1], 10), hasExplicitSlot: true };
  }

  try {
    const params = new URLSearchParams(search);
    const queryVal = params.get("authuser")?.trim();
    if (queryVal && /^[0-5]$/.test(queryVal)) {
      return { authuser: Number.parseInt(queryVal, 10), hasExplicitSlot: true };
    }
  } catch {
    // ignore search parse errors
  }

  return { authuser: 0, hasExplicitSlot: false };
}

export function parseShareRouteFromUrl(
  pathname = typeof window !== "undefined" ? window.location.pathname : "/",
  search = typeof window !== "undefined" ? window.location.search : ""
): { shareId: string | null; isShortShare: boolean } {
  const shortMatch = pathname.match(/^\/s\/([A-Za-z0-9_-]{6,64})(?:\/|$)/);
  if (shortMatch && shortMatch[1]) {
    return { shareId: shortMatch[1], isShortShare: true };
  }

  try {
    const params = new URLSearchParams(search);
    const shareParam = params.get("share")?.trim();
    if (shareParam) {
      return { shareId: shareParam, isShortShare: false };
    }
  } catch {
    // ignore
  }

  return { shareId: null, isShortShare: false };
}

export function buildSignInUrl(
  nextUrl = typeof window !== "undefined" ? window.location.href : DRIVE_ORIGIN,
  opts: { choose?: boolean; add?: boolean } = {}
): string {
  const params = new URLSearchParams();
  if (opts.choose) params.set("choose", "1");
  if (opts.add) params.set("add", "1");
  params.set("next", nextUrl);
  return `${ACCOUNTS_WEB_ORIGIN}/signin?${params.toString()}`;
}

export function buildManageAccountUrl(authuser = 0): string {
  const slot = Number.isInteger(authuser) && authuser >= 0 && authuser <= 5 ? authuser : 0;
  return `${ACCOUNTS_WEB_ORIGIN}/u/${slot}/me`;
}
