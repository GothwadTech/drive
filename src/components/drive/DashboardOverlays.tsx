import React from "react";
import type { TelegramClient } from "@mtcute/web";
import type {
  DriveConfig,
  TopicFolder,
  DriveFile,
  UploadProgress,
  DownloadProgress,
  SavedAccount,
  UserProfile,
  GothwadSsoUser,
  GothwadAccountItem,
} from "../../types";
import type { Theme } from "../../hooks/useTheme";
import { Sidebar } from "./Sidebar";
import { FileIcon } from "./FileIcon";

export interface DashboardProps {
  client?: TelegramClient | null;
  driveConfig: DriveConfig;
  topics: TopicFolder[];
  files: DriveFile[];
  loadingFiles: boolean;
  uploads: UploadProgress[];
  downloadProgress: DownloadProgress | null;
  onFolderClick: (id: number) => void;
  onBackToRoot: () => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folder: TopicFolder) => void;
  onDeleteFolder: (id: number) => void;
  onFileDrop: (files: File[]) => void;
  onDownload: (file: DriveFile) => void | Promise<void>;
  onDownloadFilesBatch?: (files: DriveFile[]) => Promise<void>;
  onCancelUpload?: (fileId: string) => void;
  onCancelDownload?: () => void;
  onRenameFile: (file: DriveFile) => void;
  onDeleteFile: (file: DriveFile) => void;
  onMoveFile?: (files: DriveFile[], targetFolderId: number) => Promise<boolean>;
  onCopyFile?: (files: DriveFile[], targetFolderId: number) => Promise<boolean>;
  onLogout: () => void;
  userProfile: UserProfile | null;
  accounts: SavedAccount[];
  activeAccountId: string | null;
  onAddAccount: () => void;
  onSwitchAccount: (userId: string) => void;
  onRemoveAccount: (userId: string) => void;
  activeFolderId: number | null;
  filterTopics: (q: string) => TopicFolder[];
  filterFiles: (q: string) => DriveFile[];
  onPreview: (file: DriveFile) => void;
  allFiles: DriveFile[];
  recentFiles: DriveFile[];
  indexing: boolean;
  indexingProgress: { current: number; total: number };
  onDeleteFilesBatch: (files: DriveFile[]) => Promise<boolean>;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  onJoinUpdateChannel?: () => void | Promise<void>;
  joiningChannel?: boolean;
  onClearCache?: () => void | Promise<void>;
  triggerConfirm?: (title: string, message: string, onConfirm: () => void | Promise<void>) => void;
  triggerToast?: (message: string, type?: "success" | "error" | "info") => void;
  favouriteChunks?: Set<string>;
  onToggleLike?: (file: DriveFile) => void;
  onShare?: (file: DriveFile) => void;
  fileSharingEnabled?: boolean;
  onToggleFileSharing?: () => void;
  onOpenReceiveShare?: (hash?: string) => void;
  ssoUser?: GothwadSsoUser | null;
  ssoAccounts?: GothwadAccountItem[];
  ssoActiveId?: string | null;
  authuser?: number;
  onSwitchSsoAccount?: (acct: GothwadAccountItem) => void | Promise<void>;
  onSignOutSsoSlot?: (slotId: string) => void | Promise<void>;
  onSignOutAllSso?: () => void | Promise<void>;
  onUnlinkVault?: () => void | Promise<void>;
}

export const FolderFilterSortBar: React.FC<{
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  sortBy: "name" | "size" | "date";
  onSelectSortBy: (sort: "name" | "size" | "date") => void;
  sortOrder: "asc" | "desc";
  onToggleSortOrder: () => void;
  gridBoxSize: "small" | "medium" | "large";
  onCycleGridBoxSize: () => void;
  showSortDropdown: boolean;
  onToggleSortDropdown: () => void;
  sortDropdownRef: React.RefObject<HTMLDivElement | null>;
}> = ({
  selectedCategory,
  onSelectCategory,
  sortBy,
  onSelectSortBy,
  sortOrder,
  onToggleSortOrder,
  gridBoxSize,
  onCycleGridBoxSize,
  showSortDropdown,
  onToggleSortDropdown,
  sortDropdownRef,
}) => (
  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
    <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
      {[
        { id: "all", label: "All Files" },
        { id: "image", label: "Images" },
        { id: "video", label: "Videos" },
        { id: "audio", label: "Audio" },
        { id: "document", label: "Documents" },
      ].map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelectCategory(cat.id)}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-2 border select-none ${
            selectedCategory === cat.id
              ? "bg-[#0494f4] text-white border-[#0494f4] shadow-md shadow-[#0494f4]/20"
              : "bg-gray-100 dark:bg-[#282828] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-[#383838] hover:bg-gray-200 dark:hover:bg-[#333333]"
          }`}
        >
          <FileIcon category={cat.id} className="w-4 h-4 shrink-0 filter drop-shadow-xs" />
          {cat.label}
        </button>
      ))}
    </div>
    <div className="relative flex items-center gap-2 shrink-0 select-none" ref={sortDropdownRef}>
      <span className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">Sort:</span>
      <button
        onClick={onToggleSortDropdown}
        className="bg-gray-100 dark:bg-[#282828] hover:bg-gray-200 dark:hover:bg-[#333333] text-gray-900 dark:text-gray-100 text-xs rounded-xl px-3 py-2 border border-gray-200 dark:border-[#383838] outline-none cursor-pointer focus:border-[#0494f4] font-bold tracking-tight flex items-center gap-1.5 min-w-[72px] justify-between transition-all"
      >
        <span className="capitalize">{sortBy}</span>
      </button>
      {showSortDropdown && (
        <div className="absolute right-9 top-full mt-1.5 z-45 bg-white dark:bg-[#282828] border border-gray-200 dark:border-[#383838] rounded-2xl shadow-xl py-1.5 min-w-[100px] overflow-hidden animate-slide-down">
          {(["date", "name", "size"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => onSelectSortBy(opt)}
              className={`w-full text-left px-4 py-2 text-xs font-semibold capitalize transition-colors ${
                sortBy === opt
                  ? "bg-[#0494f4] text-white"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333333]"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={onToggleSortOrder}
        className="p-2 rounded-xl bg-gray-100 dark:bg-[#282828] hover:bg-gray-200 dark:hover:bg-[#333333] text-gray-700 dark:text-gray-300 transition-colors cursor-pointer border border-gray-200 dark:border-[#383838] active:scale-90 mr-2"
        title={sortOrder === "asc" ? "Sort Ascending" : "Sort Descending"}
      >
        {sortOrder === "asc" ? "↑" : "↓"}
      </button>
      <button
        onClick={onCycleGridBoxSize}
        className="p-2 rounded-xl bg-gray-100 dark:bg-[#282828] hover:bg-gray-200 dark:hover:bg-[#333333] text-gray-700 dark:text-gray-300 transition-all cursor-pointer border border-gray-200 dark:border-[#383838] active:scale-90"
        title={`Grid Layout: ${gridBoxSize}`}
      >
        ⊞
      </button>
    </div>
  </div>
);

interface FloatingSelectionDockProps {
  selectedCount: number;
  onMoveCopy: () => void;
  onBatchDownload: () => void;
  onBatchDelete: () => void;
  onCancelSelection: () => void;
}

export const FloatingSelectionDock: React.FC<FloatingSelectionDockProps> = ({
  selectedCount,
  onMoveCopy,
  onBatchDownload,
  onBatchDelete,
  onCancelSelection,
}) => {
  if (selectedCount === 0) return null;
  return (
    <div
      className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 glass rounded-[20px] sm:rounded-[24px] px-3.5 sm:px-6 py-2.5 sm:py-3.5 flex items-center gap-2.5 sm:gap-4 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.3)] animate-scale-in border border-[#0494f4]/30 max-w-[95vw] sm:max-w-none overflow-x-auto no-scrollbar"
      style={{ backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
    >
      <div className="text-[11px] font-black text-md-on-surface shrink-0 uppercase tracking-wider select-none flex items-center whitespace-nowrap">
        <span className="text-[#0494f4] font-black text-sm mr-1.5">{selectedCount}</span>
        <span>Selected</span>
      </div>
      <div className="h-5 w-[1px] bg-gray-200 dark:bg-gray-700 shrink-0" />
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          onClick={onMoveCopy}
          className="flex items-center justify-center gap-1.5 h-9 px-3.5 sm:px-4 rounded-xl bg-[#0494f4]/10 hover:bg-[#0494f4]/20 text-[#0494f4] text-xs font-bold border border-[#0494f4]/20 active:scale-95 transition-all cursor-pointer select-none whitespace-nowrap shrink-0"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <span>Move / Copy</span>
        </button>
        <button
          onClick={onBatchDownload}
          className="flex items-center justify-center gap-1.5 h-9 px-3.5 sm:px-4.5 rounded-xl bg-[#0494f4] hover:bg-[#0383d8] text-white text-xs font-bold shadow-sm shadow-[#0494f4]/25 active:scale-95 transition-all cursor-pointer select-none border border-[#0494f4]/20 whitespace-nowrap shrink-0"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>Download</span>
        </button>
        <button
          onClick={onBatchDelete}
          className="flex items-center justify-center gap-1.5 h-9 px-3.5 sm:px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold transition-all border border-red-500/20 active:scale-95 cursor-pointer select-none whitespace-nowrap shrink-0"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>Delete</span>
        </button>
        <button
          onClick={onCancelSelection}
          className="flex items-center justify-center h-9 px-3 sm:px-4 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-[#333333] dark:hover:bg-[#404040] text-gray-700 dark:text-gray-300 text-xs font-bold active:scale-95 transition-all cursor-pointer select-none whitespace-nowrap shrink-0"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

interface RecentUploadContextMenuProps {
  file: DriveFile;
  x: number;
  y: number;
  onClose: () => void;
  onPreview: (file: DriveFile) => void;
  onOpenDetails: (file: DriveFile) => void;
  onDownload: (file: DriveFile) => void | Promise<void>;
  onOpenMoveCopy: (files: DriveFile[]) => void;
  onShare?: (file: DriveFile) => void;
  onRenameFile: (file: DriveFile) => void;
  onDeleteFile: (file: DriveFile) => void;
}

export const RecentUploadContextMenu: React.FC<RecentUploadContextMenuProps> = ({
  file,
  x,
  y,
  onClose,
  onPreview,
  onOpenDetails,
  onDownload,
  onOpenMoveCopy,
  onShare,
  onRenameFile,
  onDeleteFile,
}) => (
  <div
    className="fixed z-[100] bg-md-surface-container backdrop-blur-xl border border-md-outline-variant/30 rounded-[12px] py-2 min-w-[170px] animate-scale-in select-none text-left"
    style={{ top: `${y}px`, left: `${x}px` }}
    onClick={(e) => e.stopPropagation()}
  >
    <button
      onClick={() => { onPreview(file); onClose(); }}
      className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-md-on-surface hover:bg-md-surface-container-high flex items-center gap-2 cursor-pointer transition-colors min-h-[40px]"
    >
      Open / View
    </button>
    <button
      onClick={() => { onOpenDetails(file); onClose(); }}
      className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-md-on-surface hover:bg-md-surface-container-high flex items-center gap-2 cursor-pointer transition-colors min-h-[40px]"
    >
      Details
    </button>
    <button
      onClick={() => { void onDownload(file); onClose(); }}
      className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-md-on-surface hover:bg-md-surface-container-high flex items-center gap-2 cursor-pointer transition-colors min-h-[40px]"
    >
      Download
    </button>
    <button
      onClick={() => { onOpenMoveCopy([file]); onClose(); }}
      className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-md-on-surface hover:bg-md-surface-container-high flex items-center gap-2 cursor-pointer transition-colors min-h-[40px]"
    >
      Move / Copy
    </button>
    {onShare && (
      <button
        onClick={() => { onShare(file); onClose(); }}
        className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-md-on-surface hover:bg-md-surface-container-high flex items-center gap-2 cursor-pointer transition-colors min-h-[40px]"
      >
        Share File
      </button>
    )}
    <div className="h-[1px] bg-md-outline-variant/30 my-1" />
    <button
      onClick={() => { onRenameFile(file); onClose(); }}
      className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-md-on-surface hover:bg-md-surface-container-high flex items-center gap-2 cursor-pointer transition-colors min-h-[40px]"
    >
      Rename
    </button>
    <button
      onClick={() => { onDeleteFile(file); onClose(); }}
      className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-md-error hover:bg-md-error-container/30 flex items-center gap-2 cursor-pointer transition-colors min-h-[40px]"
    >
      Delete
    </button>
  </div>
);

interface MobileSidebarDrawerProps {
  open: boolean;
  topics: TopicFolder[];
  activeFolderId: number | null;
  allFiles: DriveFile[];
  indexing: boolean;
  indexingProgress: { current: number; total: number };
  onClose: () => void;
  onFolderClick: (id: number) => void;
  onCreateFolder: () => void;
  onBackToRoot: () => void;
  onJoinUpdateChannel?: () => void | Promise<void>;
  joiningChannel?: boolean;
}

export const MobileSidebarDrawer: React.FC<MobileSidebarDrawerProps> = ({
  open,
  topics,
  activeFolderId,
  allFiles,
  indexing,
  indexingProgress,
  onClose,
  onFolderClick,
  onCreateFolder,
  onBackToRoot,
  onJoinUpdateChannel,
  joiningChannel,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex lg:hidden">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md animate-fade-in"
        onClick={onClose}
      />
      <div className="relative flex flex-col w-72 max-w-[85vw] bg-white dark:bg-[#212121] h-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-r border-gray-200 dark:border-[#383838] animate-slide-right select-none z-50">
        <div className="p-4 border-b border-gray-200 dark:border-[#383838] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/icon-192.png" alt="Gothwad Drive" className="w-6 h-6 rounded-lg object-contain" />
            <span className="text-xs font-bold text-gray-900 dark:text-white">Gothwad Drive</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-[#2c2c2c] text-gray-500 hover:text-gray-900 dark:hover:text-white cursor-pointer active:scale-90"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <Sidebar
            className="w-full flex flex-col h-full bg-transparent select-none"
            folders={topics}
            activeFolderId={activeFolderId}
            onFolderClick={(id) => {
              onFolderClick(id);
              onClose();
            }}
            onCreateFolder={() => {
              onClose();
              onCreateFolder();
            }}
            onBackToRoot={() => {
              onBackToRoot();
              onClose();
            }}
            allFiles={allFiles}
            indexing={indexing}
            indexingProgress={indexingProgress}
            onJoinUpdateChannel={onJoinUpdateChannel}
            joiningChannel={joiningChannel}
          />
        </div>
      </div>
    </div>
  );
};
