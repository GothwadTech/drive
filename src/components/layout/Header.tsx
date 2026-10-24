import { useState, useRef, useEffect } from "react";
import { Input } from "../ui/Input";
import type { UserProfile, SavedAccount, GothwadSsoUser, GothwadAccountItem } from "../../types";
import type { Theme } from "../../hooks/useTheme";
import { APP_VERSION } from "../../config/telegram";
import { BOT_USERNAME } from "../../lib/bot";
import {
  preloadAccountMenuWidget,
  openAccountMenu,
  avatarColorFor,
  initialsFrom,
} from "../../lib/accountMenuWidget";
import { APP_DOMAIN, ACCOUNTS_WEB_ORIGIN, ACCOUNTS_API_ORIGIN, ECOSYSTEM_NAME } from "../../config/brand";
import { slotUrl } from "../../lib/gothwadSso";

interface HeaderProps {
  driveTitle: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onLogout: () => void;
  userProfile: UserProfile | null;
  accounts: SavedAccount[];
  activeAccountId: string | null;
  onSwitchAccount: (userId: string) => void;
  onRemoveAccount: (userId: string) => void;
  onAddAccount: () => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  onMenuClick?: () => void;
  onOpenReceiveShare?: () => void;
  fileSharingEnabled?: boolean;
  onToggleFileSharing?: () => void;
  onJoinUpdateChannel?: () => void | Promise<void>;
  joiningChannel?: boolean;
  onClearCache?: () => void | Promise<void>;
  onOpenSettingsModal?: () => void;
  ssoUser?: GothwadSsoUser | null;
  ssoAccounts?: GothwadAccountItem[];
  ssoActiveId?: string | null;
  authuser?: number;
  onSwitchSsoAccount?: (acct: GothwadAccountItem) => void | Promise<void>;
  onSignOutSsoSlot?: (slotId: string) => void | Promise<void>;
  onSignOutAllSso?: () => void | Promise<void>;
  onUnlinkVault?: () => void | Promise<void>;
}

export function Header({
  driveTitle,
  searchQuery,
  onSearchChange,
  onLogout,
  userProfile,
  accounts,
  activeAccountId,
  onSwitchAccount,
  onRemoveAccount,
  onAddAccount,
  theme,
  setTheme,
  onMenuClick,
  onOpenReceiveShare,
  fileSharingEnabled = false,
  onToggleFileSharing,
  onJoinUpdateChannel,
  joiningChannel = false,
  onClearCache,
  onOpenSettingsModal,
  ssoUser,
  ssoAccounts = [],
  ssoActiveId = null,
  authuser = 0,
  onSwitchSsoAccount,
  onSignOutSsoSlot,
  onSignOutAllSso,
  onUnlinkVault,
}: HeaderProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const avatarBtnRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    preloadAccountMenuWidget();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setShowThemeMenu(false);
      }
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName =
    ssoUser?.name ||
    (userProfile ? [userProfile.firstName, userProfile.lastName].filter(Boolean).join(" ") : "Gothwad User");
  const emailOrUsername = ssoUser?.email || (userProfile?.username ? `@${userProfile.username}` : "");
  const avatarUrl = ssoUser?.avatar_url || userProfile?.avatarUrl;
  const initials = initialsFrom(displayName, emailOrUsername);
  const avatarBg = avatarColorFor(ssoUser?.id || emailOrUsername || displayName);

  const handleAvatarClick = () => {
    if (!avatarBtnRef.current) return;
    const effectiveUser: GothwadSsoUser | null =
      ssoUser ||
      (userProfile
        ? {
            id: activeAccountId || "local",
            email: userProfile.username ? `@${userProfile.username}` : userProfile.phone || "Telegram Vault",
            name: displayName,
            avatar_url: userProfile.avatarUrl,
          }
        : null);

    const effectiveAccounts: GothwadAccountItem[] =
      ssoAccounts.length > 0
        ? ssoAccounts
        : accounts.map((a, idx) => ({
            id: a.userId,
            authuser: idx,
            email: a.username ? `@${a.username}` : a.phone || a.userId,
            name: a.idName || a.username || "Drive Account",
          }));

    openAccountMenu(
      {
        user: effectiveUser,
        accounts: effectiveAccounts,
        activeId: ssoActiveId || activeAccountId,
        authuser,
      },
      {
        appDomain: APP_DOMAIN,
        accountsWebOrigin: ACCOUNTS_WEB_ORIGIN,
        accountsApiOrigin: ACCOUNTS_API_ORIGIN,
        ecosystemName: ECOSYSTEM_NAME,
        theme,
        anchorEl: avatarBtnRef.current,
        nextUrl: window.location.href,
        manageAccountHref: `${ACCOUNTS_WEB_ORIGIN}/`,
        accountHref: (acct) => slotUrl(acct.authuser ?? 0),
        onSwitchAccount: async (target) => {
          if (onSwitchSsoAccount && ssoAccounts.length > 0) {
            await onSwitchSsoAccount(target);
          } else {
            onSwitchAccount(target.id);
          }
        },
        onSignOutAccount: async (slotId) => {
          if (onSignOutSsoSlot && ssoAccounts.length > 0) {
            await onSignOutSsoSlot(slotId);
          } else {
            onRemoveAccount(slotId);
          }
        },
        onSignOutAll: async () => {
          if (onSignOutAllSso) {
            await onSignOutAllSso();
          } else {
            onLogout();
          }
        },
        extraActions: [
          ...(onOpenSettingsModal
            ? [{ label: "Drive Vault & Storage Settings", onClick: () => onOpenSettingsModal() }]
            : []),
          ...(onOpenReceiveShare
            ? [{ label: "Redeem Shared Link or Hash", onClick: () => onOpenReceiveShare() }]
            : []),
          ...(onUnlinkVault
            ? [{ label: "Unlink Telegram Cloud Vault...", onClick: () => void onUnlinkVault() }]
            : []),
        ],
      }
    );
  };

  return (
    <header className="sticky top-0 z-40 glass border-b border-md-outline-variant/30">
      <div className="flex items-center justify-between px-2.5 sm:px-4 lg:px-6 h-16 gap-1.5 sm:gap-4">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="lg:hidden w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-transparent hover:bg-md-surface-container-high text-md-on-surface-variant flex items-center justify-center transition-all cursor-pointer active:scale-90 shrink-0"
            title="Open Menu"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 select-none">
          <img
            src="/icon-192.png"
            alt="Gothwad Drive"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl object-contain shadow-xs shrink-0"
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              if (!target.src.includes("favicon.ico")) target.src = "/favicon.ico";
            }}
          />
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-md-on-surface leading-tight flex items-center gap-1 truncate">
              <span className="text-[#0494f4]">Gothwad</span>
              <span className="hidden xs:inline">Drive</span>
            </h1>
            <p className="text-[9px] sm:text-[10px] text-md-on-surface-variant leading-tight font-medium truncate hidden md:block">
              {driveTitle === "Gothwad Drive" || driveTitle === "TG Cloud Drive" ? "Telegram Cloud Storage" : driveTitle}
            </p>
          </div>
        </div>

        <div className="flex-1 min-w-0 max-w-lg relative">
          <Input
            ref={searchRef}
            placeholder="Search in Drive"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="!bg-md-surface-container !border-md-outline-variant/50 !py-2.5 !rounded-[28px] text-sm pr-16"
            icon={
              <svg className="w-4 h-4 text-md-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
          {!searchQuery && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-0.5 pointer-events-none select-none text-[9px] font-semibold text-md-on-surface-variant bg-md-surface-container-high px-1.5 py-0.5 rounded-md border border-md-outline-variant/30">
              <span>Ctrl</span>
              <span>K</span>
            </div>
          )}
          {searchQuery && (
            <button
              onClick={() => {
                onSearchChange("");
                searchRef.current?.focus();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-md-surface-container-highest hover:bg-md-outline-variant text-md-on-surface-variant flex items-center justify-center active:scale-90 transition-all cursor-pointer"
              title="Clear Search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          <div className="relative" ref={settingsMenuRef}>
            <button
              onClick={() => {
                if (onOpenSettingsModal) onOpenSettingsModal();
                else setShowSettingsMenu(!showSettingsMenu);
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full hover:bg-md-surface-container-high text-md-on-surface-variant flex items-center justify-center transition-all cursor-pointer active:scale-95"
              title="Settings & Profile"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {showSettingsMenu && (
              <div className="absolute right-0 top-12 z-50 bg-md-surface-container rounded-[16px] p-4 w-72 max-w-[calc(100vw-1.5rem)] animate-scale-in border border-md-outline-variant/20 space-y-3.5 select-none" style={{ boxShadow: "var(--md-elevation-2)" }}>
                <div className="flex items-center justify-between border-b border-md-outline-variant/20 pb-2">
                  <h3 className="text-xs font-bold text-md-on-surface uppercase tracking-wider">Drive Settings</h3>
                  <span className="text-[10px] font-bold bg-md-primary-container text-md-on-primary-container px-2 py-0.5 rounded-full">
                    v{APP_VERSION}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-md-on-surface leading-tight">File Sharing</p>
                    <p className="text-[10px] text-md-on-surface-variant font-medium mt-0.5">Auto-invite @{BOT_USERNAME}</p>
                  </div>
                  {onToggleFileSharing && (
                    <button
                      onClick={onToggleFileSharing}
                      className={`w-[52px] h-[32px] rounded-full transition-colors relative cursor-pointer shrink-0 border-2 ${
                        fileSharingEnabled ? "bg-md-primary border-md-primary" : "bg-md-surface-container-highest border-md-outline"
                      }`}
                    >
                      <div
                        className={`rounded-full bg-white transition-all absolute top-1/2 -translate-y-1/2 ${
                          fileSharingEnabled ? "w-6 h-6 left-[24px]" : "w-4 h-4 left-[6px]"
                        }`}
                      />
                    </button>
                  )}
                </div>

                {onJoinUpdateChannel && (
                  <button
                    onClick={() => {
                      void onJoinUpdateChannel();
                      setShowSettingsMenu(false);
                    }}
                    disabled={joiningChannel}
                    className="w-full flex items-center justify-between gap-2 p-3 rounded-xl text-xs font-semibold border border-md-primary/20 bg-md-primary-container/30 hover:bg-md-primary-container/50 text-md-primary transition-all cursor-pointer"
                  >
                    <span>{joiningChannel ? "Joining..." : "Join Updates"}</span>
                    <span className="text-[9.5px] font-mono text-md-primary bg-md-primary-container px-1.5 py-0.5 rounded-md">
                      @gothwadtech
                    </span>
                  </button>
                )}

                {onClearCache && (
                  <button
                    onClick={() => {
                      void onClearCache();
                      setShowSettingsMenu(false);
                    }}
                    className="w-full flex items-center justify-between gap-2 p-3 rounded-xl text-xs font-semibold border border-md-error/20 bg-md-error-container/30 hover:bg-md-error-container/50 text-md-error transition-all cursor-pointer"
                  >
                    <span>Clear Cache</span>
                    <span className="text-[9.5px] font-medium text-md-error bg-md-error-container px-1.5 py-0.5 rounded-md">
                      Logout All
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="relative" ref={themeMenuRef}>
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full hover:bg-md-surface-container-high text-md-on-surface-variant flex items-center justify-center transition-all cursor-pointer active:scale-95"
              title="Switch Theme"
            >
              {theme === "light" ? "☀" : theme === "dark" ? "☾" : "◐"}
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 top-12 z-50 bg-md-surface-container rounded-[12px] p-1.5 w-[140px] animate-scale-in border border-md-outline-variant/20 flex flex-col gap-0.5 select-none" style={{ boxShadow: "var(--md-elevation-2)" }}>
                {(["light", "dark", "system"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTheme(t);
                      setShowThemeMenu(false);
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer min-h-[40px] ${
                      theme === t ? "bg-[#0494f4] text-white font-semibold shadow-xs" : "text-md-on-surface hover:bg-md-surface-container-high"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              ref={avatarBtnRef}
              onClick={handleAvatarClick}
              onContextMenu={(e) => {
                e.preventDefault();
                setShowDropdown(!showDropdown);
              }}
              className="flex items-center gap-1.5 p-0.5 sm:p-1 rounded-full hover:bg-md-surface-container-high transition-all cursor-pointer"
              title={`${displayName}${emailOrUsername ? ` (${emailOrUsername})` : ""}`}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover ring-2 ring-md-primary/20"
                />
              ) : (
                <div
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full text-white font-bold text-xs flex items-center justify-center shadow-xs"
                  style={{ background: avatarBg }}
                >
                  {initials}
                </div>
              )}
            </button>

            {showDropdown && (
              <div className="absolute right-0 top-12 z-50 bg-md-surface-container rounded-[16px] p-3 w-64 max-w-[calc(100vw-1.5rem)] animate-scale-in border border-md-outline-variant/20 space-y-3 select-none" style={{ boxShadow: "var(--md-elevation-2)" }}>
                <div className="px-2 py-1 border-b border-md-outline-variant/20 pb-2">
                  <p className="text-xs font-bold text-md-on-surface truncate">{displayName}</p>
                  <p className="text-[10px] text-md-on-surface-variant font-medium truncate mt-0.5">{emailOrUsername}</p>
                </div>
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    onAddAccount();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-md-surface-container-high text-md-on-surface text-xs font-semibold hover:bg-md-surface-container-highest transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  + Add Account
                </button>
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    onLogout();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-md-error-container text-md-on-error-container text-xs font-bold hover:brightness-95 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
