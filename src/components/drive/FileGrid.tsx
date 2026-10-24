import React, { useState, useEffect } from "react";
import type { TelegramClient } from "@mtcute/web";
import type { DriveFile, DriveConfig } from "../../types";
import { formatBytes } from "../../lib/manifest";
import { FileCardThumbnail } from "./FileCardThumbnail";
import { FileGridMenu } from "./FileGridMenu";
import { Pagination } from "../ui/Pagination";

interface FileGridProps {
  client?: TelegramClient | null;
  driveConfig?: DriveConfig | null;
  files: DriveFile[];
  loading: boolean;
  onDownload: (file: DriveFile) => void;
  onPreview: (file: DriveFile) => void;
  onRename?: (file: DriveFile) => void;
  onDelete?: (file: DriveFile) => void;
  selectedFileIds?: Set<number>;
  onToggleSelect?: (fileId: number) => void;
  onToggleSelectAll?: () => void;
  favouriteChunks?: Set<string>;
  onToggleLike?: (file: DriveFile) => void;
  onShare?: (file: DriveFile) => void;
  onOpenMoveCopy?: (files: DriveFile[]) => void;
  onOpenDetails?: (file: DriveFile) => void;
  gridBoxSize?: "small" | "medium" | "large";
}

export function FileGrid({
  client,
  driveConfig,
  files,
  loading,
  onDownload,
  onPreview,
  onRename,
  onDelete,
  selectedFileIds = new Set(),
  onToggleSelect,
  onToggleSelectAll,
  favouriteChunks = new Set(),
  onToggleLike,
  onShare,
  onOpenMoveCopy,
  onOpenDetails,
  gridBoxSize = "large",
}: FileGridProps) {
  const [pageState, setPageState] = useState<{ filesRef: DriveFile[]; page: number }>({
    filesRef: files,
    page: 1,
  });
  const currentPage = pageState.filesRef === files ? pageState.page : 1;
  const setCurrentPage = (nextPage: number | ((p: number) => number)) => {
    setPageState((prev) => {
      const base = prev.filesRef === files ? prev.page : 1;
      const resolved = typeof nextPage === "function" ? nextPage(base) : nextPage;
      return { filesRef: files, page: resolved };
    });
  };
  const [pageSize, setPageSize] = useState<number>(24);

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    file: DriveFile | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    file: null,
  });

  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("contextmenu", handleGlobalClick);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("contextmenu", handleGlobalClick);
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent, file: DriveFile, anchorRect?: DOMRect) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 190;
    const menuHeight = 320;
    const padding = 16;

    let x = e.clientX;
    let y = e.clientY;

    if (anchorRect) {
      x = anchorRect.left + menuWidth > window.innerWidth - padding
        ? anchorRect.right - menuWidth
        : anchorRect.left;
      y = anchorRect.bottom + menuHeight > window.innerHeight - padding
        ? anchorRect.top - menuHeight - 6
        : anchorRect.bottom + 6;
    } else {
      if (x + menuWidth > window.innerWidth - padding) {
        x = window.innerWidth - menuWidth - padding;
      }
      if (y + menuHeight > window.innerHeight - padding) {
        y = window.innerHeight - menuHeight - padding;
      }
    }

    const maxAllowedX = Math.max(padding, window.innerWidth - menuWidth - padding);
    const maxAllowedY = Math.max(padding, window.innerHeight - menuHeight - padding);

    setContextMenu({
      visible: true,
      x: Math.min(Math.max(padding, x), maxAllowedX),
      y: Math.min(Math.max(padding, y), maxAllowedY),
      file,
    });
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 sm:gap-6">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="bg-md-surface-container-low rounded-[20px] p-3 flex flex-col gap-3 animate-pulse border border-md-outline-variant/20"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="w-full aspect-[16/10.5] rounded-[12px] bg-md-surface-container-high" />
            <div className="space-y-2.5 px-0.5">
              <div className="h-4 bg-md-surface-container-high rounded-md w-3/4" />
              <div className="h-3 bg-md-surface-container-high rounded-md w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-28 animate-fade-in text-center select-none">
        <div className="w-20 h-20 mb-5 rounded-3xl bg-md-surface-container flex items-center justify-center text-md-on-surface-variant border border-md-outline-variant/20">
          <svg className="w-10 h-10 text-md-outline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-md-on-surface font-semibold mb-1 text-sm">No files in this folder</p>
        <p className="text-md-on-surface-variant text-xs max-w-[260px] leading-relaxed">
          Drag &amp; drop files anywhere on the screen to upload instantly to this folder.
        </p>
      </div>
    );
  }

  const totalItems = files.length;
  const isAll = pageSize === 0 || pageSize >= totalItems;
  const totalPages = isAll ? 1 : Math.ceil(totalItems / pageSize);

  const paginatedFiles = isAll
    ? files
    : files.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const groups = new Map<string, DriveFile[]>();
  for (const f of paginatedFiles) {
    const d = new Date(f.date * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
  const sections = sortedKeys.reduce<
    Array<{ key: string; sectionFiles: DriveFile[]; label: string; startIdx: number }>
  >((acc, key) => {
    const sectionFiles = groups.get(key)!;
    const d = new Date(parseInt(key.split("-")[0]), parseInt(key.split("-")[1]) - 1);
    const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const prevEnd = acc.length > 0 ? acc[acc.length - 1].startIdx + acc[acc.length - 1].sectionFiles.length : 0;
    acc.push({ key, sectionFiles, label, startIdx: prevEnd });
    return acc;
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1 select-none">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onToggleSelectAll?.()}
            className="w-5 h-5 rounded-md border border-md-outline-variant flex items-center justify-center transition-all bg-md-surface-container-lowest cursor-pointer hover:border-md-primary"
          >
            {files.length > 0 && files.every((f) => selectedFileIds.has(f.id)) && (
              <svg className="w-3.5 h-3.5 text-md-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-md-on-surface-variant">
            Select All
          </span>
        </div>
        {selectedFileIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-md-primary bg-md-primary-container px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
              {selectedFileIds.size} selected
            </span>
            {onOpenMoveCopy && (
              <button
                onClick={() => {
                  const selectedFiles = files.filter((f) => selectedFileIds.has(f.id));
                  if (selectedFiles.length > 0) onOpenMoveCopy(selectedFiles);
                }}
                className="py-1 px-3 rounded-full bg-md-primary-container hover:brightness-95 text-md-on-primary-container text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Move / Copy
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-8 pb-6">
        {sections.map(({ key, sectionFiles, label, startIdx }) => {
          return (
            <div key={key} className="space-y-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-md-on-surface-variant select-none px-1">
                {label}
              </h3>
              <div
                className={
                  gridBoxSize === "small"
                    ? "grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-2.5 sm:gap-3"
                    : gridBoxSize === "medium"
                      ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3.5"
                      : "grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4"
                }
              >
                {sectionFiles.map((file, idx) => {
                  const isSelected = selectedFileIds.has(file.id);
                  const isLiked = favouriteChunks.has(file.manifest.chunks.join(","));
                  const cardRoundClass = gridBoxSize === "small" ? "rounded-2xl" : "rounded-3xl";
                  const cardPadding = gridBoxSize === "small" ? "p-2.5" : "p-3";
                  const titleTextSize =
                    gridBoxSize === "small"
                      ? "text-[11px]"
                      : gridBoxSize === "medium"
                        ? "text-[11px] font-bold"
                        : "text-xs font-bold";
                  const metaRowClass =
                    gridBoxSize === "small"
                      ? "hidden"
                      : "flex items-center justify-between mt-1 h-4.5 text-[10px] text-gray-500 dark:text-gray-400 font-medium tracking-tight relative";
                  const checkBtnSize = gridBoxSize === "small" ? "w-5 h-5" : "w-5.5 h-5.5";
                  const checkIconSize = gridBoxSize === "small" ? "w-3 h-3" : "w-3.5 h-3.5";
                  const likeBtnSize =
                    gridBoxSize === "small"
                      ? "w-6.5 h-6.5"
                      : gridBoxSize === "medium"
                        ? "w-7 h-7"
                        : "w-7.5 h-7.5";
                  const likeIconSize = gridBoxSize === "small" ? "w-3.5 h-3.5" : "w-4 h-4";
                  const extTagTextSize =
                    gridBoxSize === "small" ? "text-[8px] px-1" : "text-[8.5px] px-1.5";

                  return (
                    <div
                      key={file.id}
                      className={`group relative bg-white dark:bg-[#282828] ${cardRoundClass} ${cardPadding} flex flex-col justify-between transition-all duration-200 ease-out border select-none cursor-pointer hover:shadow-md hover:shadow-black/5 dark:hover:shadow-black/30 hover:-translate-y-0.5 ${
                        isSelected
                          ? "border-[#0494f4] ring-2 ring-[#0494f4]/30 bg-[#0494f4]/5"
                          : "border-gray-200 dark:border-[#383838] hover:border-[#0494f4]/50"
                      }`}
                      style={{ animationDelay: `${Math.min((startIdx + idx) * 15, 250)}ms` }}
                      onClick={() => onPreview(file)}
                      onContextMenu={(e) => handleContextMenu(e, file)}
                    >
                      <div className="relative aspect-[4/3] bg-md-surface-container flex items-center justify-center overflow-hidden shrink-0">
                        <FileCardThumbnail
                          file={file}
                          client={client}
                          driveConfig={driveConfig}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />

                        <div
                          className={`absolute top-2.5 left-2.5 z-10 transition-opacity duration-200 ${
                            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => onToggleSelect?.(file.id)}
                            className={`${checkBtnSize} rounded-full border flex items-center justify-center transition-all duration-200 ${
                              isSelected
                                ? "bg-md-primary border-md-primary text-md-on-primary shadow-md scale-100"
                                : "border-md-outline-variant bg-white/70 dark:bg-md-surface-container/70 hover:scale-110 active:scale-95"
                            }`}
                          >
                            {isSelected && (
                              <svg className={checkIconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        </div>

                        <div className={`absolute top-2.5 right-2.5 bg-md-inverse-surface/70 backdrop-blur-[6px] py-0.5 rounded-[6px] font-semibold uppercase text-md-inverse-on-surface tracking-wider select-none border border-white/5 shadow-sm ${extTagTextSize}`}>
                          {file.name.split(".").pop()?.toLowerCase() || "file"}
                        </div>

                        <div
                          className={`absolute bottom-2.5 right-2.5 z-10 transition-opacity duration-200 ${
                            isLiked ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => onToggleLike?.(file)}
                            className={`${likeBtnSize} rounded-full border flex items-center justify-center transition-all duration-200 ${
                              isLiked
                                ? "bg-md-error border-md-error text-md-on-error shadow-md scale-100"
                                : "border-md-outline-variant bg-white/70 dark:bg-md-surface-container/70 hover:scale-110 active:scale-95 text-md-on-surface-variant"
                            }`}
                          >
                            <svg className={likeIconSize} fill={isLiked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isLiked ? 0 : 2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className={`${cardPadding} select-none flex flex-col justify-between flex-grow min-w-0`}>
                        <p className={`${titleTextSize} text-md-on-surface truncate tracking-tight group-hover:text-md-primary transition-colors`} title={file.name}>
                          {file.name}
                        </p>

                        <div className={metaRowClass}>
                          <span className="group-hover:opacity-0 transition-opacity duration-150 shrink-0">
                            {formatBytes(file.size)}
                          </span>

                          <div
                            className="absolute bottom-0 right-0 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity duration-200"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => onDownload(file)}
                              className="p-1 rounded-md hover:bg-md-surface-container-high text-md-on-surface-variant hover:text-md-primary active:scale-90 transition-all cursor-pointer"
                              title="Download"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                handleContextMenu(e, file, rect);
                              }}
                              className="p-1 rounded-md hover:bg-md-surface-container-high text-md-on-surface-variant hover:text-md-primary active:scale-90 transition-all cursor-pointer"
                              title="More options"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />
      )}

      {contextMenu.visible && contextMenu.file && (
        <FileGridMenu
          file={contextMenu.file}
          x={contextMenu.x}
          y={contextMenu.y}
          isSelected={selectedFileIds.has(contextMenu.file.id)}
          onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
          onPreview={onPreview}
          onOpenDetails={onOpenDetails}
          onDownload={onDownload}
          onShare={onShare}
          onToggleSelect={onToggleSelect}
          onOpenMoveCopy={onOpenMoveCopy}
          onRename={onRename}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
