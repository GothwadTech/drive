/**
 * =============================================================================
 * UNIVERSAL GOOGLE-STYLE ACCOUNT SWITCHER PRELOADER & 0MS FALLBACK CONTROLLER
 * Preloads `${ACCOUNTS_WEB_ORIGIN}/widget/account-menu.js` on boot and ensures
 * `window.GothwadAccountMenu` is available in 0ms even before the remote script
 * finishes loading or during offline local development.
 * =============================================================================
 */

import {
  ACCOUNT_WIDGET_URL,
  ACCOUNTS_API_ORIGIN,
  ACCOUNTS_WEB_ORIGIN,
  APP_DOMAIN,
  ECOSYSTEM_NAME,
} from "../config/brand";
import type { GothwadAccountItem, GothwadSsoUser } from "../types";

export interface GothwadAccountMenuOptions {
  appDomain?: string;
  accountsWebOrigin?: string;
  accountsApiOrigin?: string;
  ecosystemName?: string;
  theme?: "light" | "dark" | "system";
  anchorEl?: HTMLElement | null;
  nextUrl?: string;
  manageAccountHref?: string;
  accountHref?: (acct: GothwadAccountItem) => string;
  onSwitchAccount?: (acct: GothwadAccountItem) => void | Promise<void>;
  onSignOutAccount?: (slotId: string) => void | Promise<void>;
  onSignOutAll?: () => void | Promise<void>;
  onManageAccount?: () => void;
  onEditAvatar?: () => void;
  onClose?: () => void;
  onError?: (msg: string) => void;
  extraActions?: { label: string; onClick: () => void }[];
}

export interface GothwadAccountMenuState {
  user: GothwadSsoUser | null;
  accounts: GothwadAccountItem[];
  activeId: string | null;
  authuser: number;
}

export interface GothwadAccountMenuController {
  isOpen(): boolean;
  open(state: GothwadAccountMenuState, opts?: GothwadAccountMenuOptions): void;
  update(patchState: Partial<GothwadAccountMenuState>, patchOpts?: Partial<GothwadAccountMenuOptions>): void;
  close(): void;
}

declare global {
  interface Window {
    GothwadAccountMenu?: GothwadAccountMenuController;
  }
}

const AVATAR_PALETTE = [
  "#9334a6", "#0b57d0", "#0d652d", "#c5221f", "#00639b", "#b06000", "#7627bb", "#185abc",
];

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch] || ch));
}

export function avatarColorFor(seed: string): string {
  const s = String(seed || "u").toLowerCase();
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function initialsFrom(name?: string, fallback?: string): string {
  const full = String(name || fallback || "?").trim();
  const parts = full.split(/[\s._@-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return full.slice(0, 1).toUpperCase() || "?";
}

export function initialsFromAccount(item?: Partial<GothwadAccountItem | GothwadSsoUser> | null): string {
  const full = `${item?.firstName || ""} ${item?.lastName || ""}`.trim()
    || String(item?.name || item?.username || "?").trim();
  return initialsFrom(full);
}

const FALLBACK_CSS = `
.gw-layer {
  --gw-surface: #eef3f8; --gw-card: #ffffff; --gw-card-hover: #f5f8fc;
  --gw-text: #1f1f1f; --gw-subtext: #444746; --gw-accent: #0b57d0;
  --gw-danger: #b3261e; --gw-danger-bg: #fceeee; --gw-border: rgba(0,0,0,0.08);
  position: fixed; inset: 0; z-index: 2147483000;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--gw-text);
}
.gw-layer[data-theme="dark"] {
  --gw-surface: #1b1f26; --gw-card: #282c34; --gw-card-hover: #323741;
  --gw-text: #e3e3e3; --gw-subtext: #c4c7c5; --gw-accent: #8ab4f8;
  --gw-danger: #f28b82; --gw-danger-bg: #3c2525; --gw-border: rgba(255,255,255,0.1);
}
.gw-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.28); }
.gw-sheet {
  position: fixed; inset: 0; display: flex; flex-direction: column;
  background: var(--gw-surface); overflow-y: auto; padding: 14px 16px 20px;
}
@media (min-width: 640px) {
  .gw-backdrop { background: transparent; }
  .gw-sheet {
    inset: auto; top: var(--gw-top, 58px); right: var(--gw-right, 16px);
    width: 388px; max-width: calc(100vw - 24px); border-radius: 28px;
    border: 1px solid var(--gw-border);
    box-shadow: 0 16px 42px rgba(0,0,0,0.24), 0 2px 8px rgba(0,0,0,0.12);
  }
}
.gw-topbar { display: flex; justify-content: flex-end; margin-bottom: 4px; }
.gw-close { width: 36px; height: 36px; border: none; border-radius: 999px; background: transparent; color: var(--gw-subtext); cursor: pointer; font-size: 18px; }
.gw-stack { display: flex; flex-direction: column; gap: 2px; }
.gw-hero { display: flex; align-items: center; gap: 14px; background: var(--gw-card); padding: 16px 18px; border-radius: 24px 24px 4px 4px; }
.gw-avatar { display: inline-grid; place-items: center; border-radius: 999px; overflow: hidden; color: #fff; font-weight: 600; flex-shrink: 0; }
.gw-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gw-hero-name { font-size: 18px; font-weight: 600; color: var(--gw-text); }
.gw-hero-email { font-size: 13px; color: var(--gw-subtext); margin-top: 2px; }
.gw-row {
  display: flex; align-items: center; gap: 14px; width: 100%; min-height: 56px;
  padding: 10px 18px; border: none; border-radius: 4px; background: var(--gw-card);
  color: var(--gw-text); text-align: left; text-decoration: none; font-size: 14px;
  font-weight: 500; cursor: pointer; box-sizing: border-box;
}
.gw-row:hover { background: var(--gw-card-hover); }
.gw-row.is-last { border-radius: 4px 4px 24px 24px; }
.gw-acct-meta { flex: 1; min-width: 0; }
.gw-acct-name { display: block; font-size: 14px; font-weight: 500; color: var(--gw-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gw-acct-email { display: block; font-size: 12px; color: var(--gw-subtext); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gw-manage-pill {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; min-height: 50px; margin-top: 12px; padding: 0 20px;
  border-radius: 999px; background: var(--gw-card); color: var(--gw-text);
  text-decoration: none; font-size: 14px; font-weight: 500; box-sizing: border-box;
}
.gw-manage-pill:hover { background: var(--gw-card-hover); }
.gw-extra-group { display: flex; flex-direction: column; gap: 2px; margin-top: 10px; }
.gw-extra-group .gw-row { border-radius: 20px; }
`;

function renderAvatarHtml(acct: Partial<GothwadAccountItem>, sizePx: number): string {
  const bg = avatarColorFor(acct.username || acct.email || acct.name || "u");
  const label = esc(initialsFromAccount(acct));
  const fontSize = Math.max(13, Math.round(sizePx * 0.42));
  if (acct.avatarUrl) {
    return `<span class="gw-avatar" style="width:${sizePx}px;height:${sizePx}px;background:${bg};font-size:${fontSize}px;">
      <img src="${esc(acct.avatarUrl)}" alt="" referrerpolicy="no-referrer" />
    </span>`;
  }
  return `<span class="gw-avatar" style="width:${sizePx}px;height:${sizePx}px;background:${bg};font-size:${fontSize}px;">${label}</span>`;
}

class FallbackAccountMenu implements GothwadAccountMenuController {
  private hostEl: HTMLDivElement | null = null;
  private layerEl: HTMLDivElement | null = null;
  private state: GothwadAccountMenuState = { user: null, accounts: [], activeId: null, authuser: 0 };
  private opts: GothwadAccountMenuOptions = {};
  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.close();
  };

  isOpen(): boolean {
    return Boolean(this.hostEl);
  }

  open(state: GothwadAccountMenuState, opts: GothwadAccountMenuOptions = {}): void {
    this.state = { ...this.state, ...state };
    this.opts = { ...opts };
    if (!this.hostEl && typeof document !== "undefined") {
      this.hostEl = document.createElement("div");
      const shadow = this.hostEl.attachShadow ? this.hostEl.attachShadow({ mode: "open" }) : this.hostEl;
      const style = document.createElement("style");
      style.textContent = FALLBACK_CSS;
      this.layerEl = document.createElement("div");
      this.layerEl.className = "gw-layer";
      shadow.appendChild(style);
      shadow.appendChild(this.layerEl);
      document.body.appendChild(this.hostEl);
      window.addEventListener("keydown", this.onKey);
    }
    this.render();
  }

  update(patchState: Partial<GothwadAccountMenuState>, patchOpts?: Partial<GothwadAccountMenuOptions>): void {
    this.state = { ...this.state, ...patchState };
    if (patchOpts) this.opts = { ...this.opts, ...patchOpts };
    if (this.isOpen()) this.render();
  }

  close(): void {
    if (!this.hostEl) return;
    this.hostEl.remove();
    this.hostEl = null;
    this.layerEl = null;
    window.removeEventListener("keydown", this.onKey);
    this.opts.onClose?.();
  }

  private render(): void {
    if (!this.layerEl) return;
    const isDark =
      this.opts.theme === "dark" ||
      (this.opts.theme !== "light" && document.documentElement.classList.contains("dark"));
    this.layerEl.setAttribute("data-theme", isDark ? "dark" : "light");

    const rect = this.opts.anchorEl?.getBoundingClientRect?.();
    if (rect) {
      this.layerEl.style.setProperty("--gw-top", `${Math.max(12, Math.round(rect.bottom + 10))}px`);
      this.layerEl.style.setProperty("--gw-right", `${Math.max(12, Math.round(window.innerWidth - rect.right))}px`);
    }

    const active = this.state.user || this.state.accounts[0];
    const others = (this.state.accounts || []).filter(
      (a) => (a.username || a.email || "").toLowerCase() !== (active?.username || active?.email || "").toLowerCase()
    );
    const webOrigin = this.opts.accountsWebOrigin || ACCOUNTS_WEB_ORIGIN;
    const nextUrl = this.opts.nextUrl || window.location.href;
    const addHref = `${webOrigin}/signin?choose=1&add=1&next=${encodeURIComponent(nextUrl)}`;
    const manageHref = this.opts.manageAccountHref || `${webOrigin}/u/${this.state.authuser}/me`;
    const extraActions = this.opts.extraActions || [];

    this.layerEl.innerHTML = `
      <div class="gw-backdrop" data-action="close"></div>
      <div class="gw-sheet" role="dialog" aria-modal="true" aria-label="${esc(ECOSYSTEM_NAME)} Account menu">
        <div class="gw-topbar">
          <button type="button" class="gw-close" data-action="close" aria-label="Close">&times;</button>
        </div>
        <div class="gw-stack">
          <div class="gw-hero">
            ${renderAvatarHtml(active || {}, 64)}
            <div class="gw-acct-meta">
              <div class="gw-hero-name">${esc(active?.name || active?.username || "Account")}</div>
              <div class="gw-hero-email">${esc(active?.email || "")}</div>
            </div>
          </div>
          ${others.map((acct) => {
            const href = this.opts.accountHref ? this.opts.accountHref(acct) : `/u/${acct.authuser}/`;
            return `<a href="${esc(href)}" class="gw-row" data-switch="${esc(acct.id)}">
              ${renderAvatarHtml(acct, 38)}
              <span class="gw-acct-meta">
                <span class="gw-acct-name">${esc(acct.name)}</span>
                <span class="gw-acct-email">${esc(acct.email)}</span>
              </span>
            </a>`;
          }).join("")}
          <a href="${esc(addHref)}" class="gw-row">
            <span class="gw-acct-meta"><span class="gw-acct-name">+ Add another account</span></span>
          </a>
          <button type="button" class="gw-row is-last" data-action="signout-active" style="color:var(--gw-danger);">
            <span class="gw-acct-meta"><span class="gw-acct-name" style="color:var(--gw-danger);">Sign out of ${esc(active?.email || active?.username || "account")}</span></span>
          </button>
        </div>
        <a href="${esc(manageHref)}" class="gw-manage-pill">
          <span>Manage your ${esc(this.opts.ecosystemName || ECOSYSTEM_NAME)} Account</span>
        </a>
        ${extraActions.length > 0 ? `<div class="gw-extra-group">
          ${extraActions.map((a, idx) => `<button type="button" class="gw-row" data-extra="${idx}">
            <span class="gw-acct-meta"><span class="gw-acct-name">${esc(a.label)}</span></span>
          </button>`).join("")}
        </div>` : ""}
      </div>
    `;

    this.layerEl.querySelectorAll('[data-action="close"]').forEach((el) => {
      el.addEventListener("click", () => this.close());
    });
    this.layerEl.querySelectorAll("[data-switch]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey) return;
        e.preventDefault();
        const id = el.getAttribute("data-switch");
        const target = this.state.accounts.find((a) => a.id === id);
        this.close();
        if (target) void this.opts.onSwitchAccount?.(target);
      });
    });
    this.layerEl.querySelector('[data-action="signout-active"]')?.addEventListener("click", () => {
      const slotId = this.state.activeId || this.state.accounts[0]?.id || "a";
      this.close();
      if (this.opts.onSignOutAccount) void this.opts.onSignOutAccount(slotId);
      else void this.opts.onSignOutAll?.();
    });
    this.layerEl.querySelectorAll("[data-extra]").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = Number(el.getAttribute("data-extra"));
        this.close();
        extraActions[idx]?.onClick?.();
      });
    });
  }
}

let preloadStarted = false;

export function preloadGothwadAccountMenu(): void {
  if (typeof window === "undefined") return;
  if (!window.GothwadAccountMenu) {
    window.GothwadAccountMenu = new FallbackAccountMenu();
  }
  if (preloadStarted) return;
  preloadStarted = true;

  try {
    const existing = document.querySelector(`script[src="${ACCOUNT_WIDGET_URL}"]`);
    if (!existing) {
      const script = document.createElement("script");
      script.type = "module";
      script.async = true;
      script.src = ACCOUNT_WIDGET_URL;
      document.head.appendChild(script);
    }
  } catch {
    // Fallback controller remains active
  }
}

export function openGothwadAccountMenu(
  state: GothwadAccountMenuState,
  opts: GothwadAccountMenuOptions
): void {
  preloadGothwadAccountMenu();
  window.GothwadAccountMenu?.open(state, {
    appDomain: APP_DOMAIN,
    accountsWebOrigin: ACCOUNTS_WEB_ORIGIN,
    accountsApiOrigin: `${ACCOUNTS_API_ORIGIN}/api`,
    ecosystemName: ECOSYSTEM_NAME,
    ...opts,
  });
}

export const preloadAccountMenuWidget = preloadGothwadAccountMenu;
export const openAccountMenu = openGothwadAccountMenu;
