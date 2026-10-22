import React from "react";
import type { TelegramClient } from "@mtcute/web";
import type { DriveConfig, TopicFolder, DriveFile } from "../../types";
import { formatBytes } from "../../lib/manifest";
import { FileCardThumbnail } from "./FileCardThumbnail";
import { FileGrid } from "./FileGrid";

function getFolderIcon(title: string, color: string, baseClass = "w-5 h-5 shrink-0") {
  const t = title.toLowerCase();

  if (t.includes("favour") || t.includes("favor")) {
    return (
      <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.969 0 1.371 1.24.588 1.81l-3.97 2.883a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.883a1 1 0 00-1.175 0l-3.97 2.883c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.98 10.1c-.783-.57-.38-1.81.588-1.81h4.906a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    );
  }
  if (t.includes("video") || t.includes("movie") || t.includes("film")) {
    return (
      <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    );
  }
  if (t.includes("audio") || t.includes("music") || t.includes("sound") || t.includes("song")) {
    return (
      <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    );
  }
  if (t.includes("photo") || t.includes("image") || t.includes("pic") || t.includes("gallery")) {
    return (
      <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (t.includes("doc") || t.includes("text") || t.includes("pdf") || t.includes("file") || t.includes("sheet")) {
    return (
      <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  return (
    <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

interface DashboardRootSectionProps {
  client?: TelegramClient | null;
  driveConfig: DriveConfig;
  searchQuery: string;
  recentFiles: DriveFile[];
  displayedTopics: TopicFolder[];
  matchingFiles: DriveFile[];
  allFiles: DriveFile[];
  loadingFiles: boolean;
  selectedFileIds: Set<number>;
  favouriteChunks: Set<string>;
  gridBoxSize: "small" | "medium" | "large";
  onPreview: (file: DriveFile) => void;
  onRecentContextMenu: (e: React.MouseEvent, file: DriveFile) => void;
  onShowCreateFolder: () => void;
  onFolderClick: (id: number) => void;
  onRenameFolder: (folder: TopicFolder) => void;
  onDeleteFolder: (id: number) => void;
  onDownload: (file: DriveFile) => void;
  onRenameFile: (file: DriveFile) => void;
  onDeleteFile: (file: DriveFile) => void;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onToggleLike?: (file: DriveFile) => void;
  onShare?: (file: DriveFile) => void;
  onOpenMoveCopy: (files: DriveFile[]) => void;
  onOpenDetails: (file: DriveFile) => void;
}

export const DashboardRootSection: React.FC<DashboardRootSectionProps> = ({
  client,
  driveConfig,
  searchQuery,
  recentFiles,
  displayedTopics,
  matchingFiles,
  allFiles,
  loadingFiles,
  selectedFileIds,
  favouriteChunks,
  gridBoxSize,
  onPreview,
  onRecentContextMenu,
  onShowCreateFolder,
  onFolderClick,
  onRenameFolder,
  onDeleteFolder,
  onDownload,
  onRenameFile,
  onDeleteFile,
  onToggleSelect,
  onToggleSelectAll,
  onToggleLike,
  onShare,
  onOpenMoveCopy,
  onOpenDetails,
}) => {
  return (
    <div className="space-y-8">
      {!searchQuery && recentFiles.length > 0 && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-md-on-surface-variant flex items-center gap-2 select-none">
              <span>Recent Uploads</span>
              <span className="text-[9px] uppercase bg-md-primary-container text-md-on-primary-container font-semibold px-2 py-0.5 rounded-full select-none">
                Activity
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {recentFiles.map((file) => {
              const ext = file.name.split(".").pop()?.toUpperCase() || "FILE";
              return (
                <div
                  key={file.id}
                  onClick={() => onPreview(file)}
                  onContextMenu={(e) => onRecentContextMenu(e, file)}
                  className="group relative flex flex-col bg-md-surface-container-lowest rounded-[20px] overflow-hidden border border-md-outline-variant/30 hover:border-md-primary/30 transition-all duration-300 cursor-pointer select-none"
                  style={{ boxShadow: "var(--md-elevation-1)" }}
                >
                  <div className="relative aspect-[16/10] w-full bg-md-surface-container overflow-hidden flex items-center justify-center p-2">
                    <FileCardThumbnail
                      file={file}
                      client={client}
                      driveConfig={driveConfig}
                      className="w-full h-full object-cover rounded-xl transition-transform duration-300 group-hover:scale-105"
                    />
                    <span className="absolute top-2 right-2 text-[8px] font-semibold font-mono bg-md-inverse-surface/70 backdrop-blur-md text-md-inverse-on-surface px-1.5 py-0.5 rounded-md border border-white/5 shadow-sm">
                      {ext}
                    </span>
                    <div className="absolute inset-0 bg-md-primary-container/20 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-md-surface-container-highest text-md-primary flex items-center justify-center shadow-md transform scale-75 group-hover:scale-100 transition-transform">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-md-surface-container-lowest border-t border-md-outline-variant/20 flex flex-col gap-0.5 min-w-0">
                    <p className="text-xs font-semibold text-md-on-surface truncate group-hover:text-md-primary transition-colors leading-tight" title={file.name}>
                      {file.name}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-md-on-surface-variant font-medium font-mono mt-0.5">
                      <span>{formatBytes(file.size)}</span>
                      <span>{new Date(file.date * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-md-on-surface-variant">
          {searchQuery ? "Matching Folders" : "Folders"}
          <span className="text-[10px] font-semibold text-md-on-surface-variant ml-2 bg-md-surface-container-high px-2 py-0.5 rounded-full font-mono border border-md-outline-variant/20">
            {displayedTopics.length}
          </span>
        </h2>
        <button
          onClick={onShowCreateFolder}
          className="lg:hidden flex items-center gap-1.5 text-xs text-md-primary hover:underline transition-colors font-semibold uppercase tracking-wider cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      </div>

      {displayedTopics.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayedTopics.map((folder, idx) => {
            const getFolderTheme = (title: string, index: number) => {
              const t = title.toLowerCase();
              if (t.includes("favour") || t.includes("favor")) {
                return { text: "var(--color-warning)", bg: "bg-warning-container/30", border: "hover:border-warning/40" };
              }
              if (t.includes("video") || t.includes("movie") || t.includes("audio") || t.includes("music")) {
                return { text: "var(--md-tertiary)", bg: "bg-md-tertiary-container/30", border: "hover:border-md-tertiary/40" };
              }
              if (t.includes("photo") || t.includes("image") || t.includes("pic")) {
                return { text: "var(--color-success)", bg: "bg-success-container/30", border: "hover:border-success/40" };
              }
              if (t.includes("doc") || t.includes("text") || t.includes("pdf") || t.includes("file")) {
                return { text: "var(--md-primary)", bg: "bg-md-primary-container/30", border: "hover:border-md-primary/40" };
              }
              const fallbackColors = [
                { text: "var(--md-primary)", bg: "bg-md-primary-container/30", border: "hover:border-md-primary/40" },
                { text: "var(--color-warning)", bg: "bg-warning-container/30", border: "hover:border-warning/40" },
                { text: "var(--md-tertiary)", bg: "bg-md-tertiary-container/30", border: "hover:border-md-tertiary/40" },
              ];
              return fallbackColors[index % fallbackColors.length];
            };
            const fTheme = getFolderTheme(folder.title, idx);
            const fileCount = allFiles.filter((f) => f.topicId === folder.id).length;

            return (
              <div
                key={folder.id}
                onClick={() => onFolderClick(folder.id)}
                className={`group relative bg-md-surface-container-lowest border border-md-outline-variant/30 ${fTheme.border} rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:-translate-y-0.5 transition-all duration-200 select-none`}
                style={{ boxShadow: "var(--md-elevation-1)" }}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`w-10 h-10 rounded-full ${fTheme.bg} flex items-center justify-center shrink-0`}>
                    {getFolderIcon(folder.title, fTheme.text)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-md-on-surface truncate tracking-tight group-hover:text-md-primary transition-colors">
                      {folder.title}
                    </h4>
                    <p className="text-[10px] text-md-on-surface-variant font-medium mt-0.5">
                      {fileCount} {fileCount === 1 ? "file" : "files"}
                    </p>
                  </div>
                </div>

                <div
                  className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ml-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onRenameFolder(folder)}
                    className="p-1.5 rounded-md hover:bg-md-surface-container-high text-md-on-surface-variant hover:text-md-primary active:scale-90 transition-all cursor-pointer"
                    title="Rename Folder"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDeleteFolder(folder.id)}
                    className="p-1.5 rounded-md hover:bg-md-error-container/30 text-md-on-surface-variant hover:text-md-error active:scale-90 transition-all cursor-pointer"
                    title="Delete Folder"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        searchQuery && (
          <p className="text-xs text-md-on-surface-variant italic select-none">No folders matching &quot;{searchQuery}&quot;</p>
        )
      )}

      {searchQuery && (
        <div className="space-y-4 pt-6 border-t border-md-outline-variant/20">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-md-on-surface-variant flex items-center gap-2">
            <span>Search Results: Files</span>
            <span className="text-[10px] font-semibold text-md-on-surface-variant bg-md-surface-container-high px-2 py-0.5 rounded-full font-mono border border-md-outline-variant/20">
              {matchingFiles.length}
            </span>
          </h2>
          <FileGrid
            files={matchingFiles}
            loading={loadingFiles}
            onDownload={onDownload}
            onPreview={onPreview}
            onRename={onRenameFile}
            onDelete={onDeleteFile}
            selectedFileIds={selectedFileIds}
            onToggleSelect={onToggleSelect}
            onToggleSelectAll={onToggleSelectAll}
            favouriteChunks={favouriteChunks}
            onToggleLike={onToggleLike}
            onShare={onShare}
            onOpenMoveCopy={onOpenMoveCopy}
            onOpenDetails={onOpenDetails}
            gridBoxSize={gridBoxSize}
          />
        </div>
      )}

      {searchQuery && displayedTopics.length === 0 && matchingFiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in text-center select-none">
          <div className="w-16 h-16 mb-4 rounded-2xl bg-md-surface-container flex items-center justify-center text-md-on-surface-variant border border-md-outline-variant/20">
            <svg className="w-8 h-8 text-md-outline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-md-on-surface font-semibold mb-1 text-sm">No results found</p>
          <p className="text-md-on-surface-variant text-xs max-w-[260px] leading-relaxed">
            We couldn&apos;t find any folders or files matching &quot;{searchQuery}&quot;
          </p>
        </div>
      )}
    </div>
  );
};
