import { useState, useRef, useEffect } from "react";
import type { DriveFile } from "../../types";
import { Header } from "../layout/Header";
import { Sidebar } from "./Sidebar";
import { Breadcrumb } from "./Breadcrumb";
import { FileGrid } from "./FileGrid";
import { UploadZone } from "./UploadZone";
import { CreateFolderModal } from "./CreateFolderModal";
import { MoveCopyModal } from "./MoveCopyModal";
import { FileInfoModal } from "./FileInfoModal";
import { SettingsModal } from "./SettingsModal";
import { FloatingTransferWidget } from "./FloatingTransferWidget";
import { DashboardRootSection } from "./DashboardRootSection";
import {
  type DashboardProps,
  FolderFilterSortBar,
  FloatingSelectionDock,
  RecentUploadContextMenu,
  MobileSidebarDrawer,
} from "./DashboardOverlays";

export function Dashboard(props: DashboardProps) {
  const {
    client, driveConfig, topics, files, loadingFiles, uploads, downloadProgress,
    onFolderClick, onBackToRoot, onCreateFolder, onRenameFolder, onDeleteFolder,
    onFileDrop, onDownload, onDownloadFilesBatch, onCancelUpload, onCancelDownload,
    onRenameFile, onDeleteFile, onMoveFile, onCopyFile, onLogout, userProfile,
    accounts, activeAccountId, onAddAccount, onSwitchAccount, onRemoveAccount,
    activeFolderId, filterTopics, filterFiles, onPreview, allFiles, recentFiles,
    indexing, indexingProgress, onDeleteFilesBatch, theme, setTheme,
    onJoinUpdateChannel, joiningChannel = false, onClearCache, triggerConfirm,
    triggerToast, favouriteChunks = new Set(), onToggleLike, onShare,
    fileSharingEnabled, onToggleFileSharing, onOpenReceiveShare, ssoUser,
    ssoAccounts, ssoActiveId, authuser = 0, onSwitchSsoAccount,
    onSignOutSsoSlot, onSignOutAllSso, onUnlinkVault,
  } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [moveCopyTarget, setMoveCopyTarget] = useState<{ open: boolean; files: DriveFile[] } | null>(null);
  const [infoModalFile, setInfoModalFile] = useState<DriveFile | null>(null);
  const [recentContextMenu, setRecentContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    file: DriveFile | null;
  }>({ visible: false, x: 0, y: 0, file: null });

  const handleRecentContextMenu = (e: React.MouseEvent, file: DriveFile) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 190;
    const menuHeight = 320;
    const padding = 16;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - padding);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - padding);
    setRecentContextMenu({
      visible: true,
      x: Math.max(padding, x),
      y: Math.max(padding, y),
      file,
    });
  };

  useEffect(() => {
    const handleGlobalClick = () => {
      setRecentContextMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "size" | "date">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [gridBoxSize, setGridBoxSize] = useState<"small" | "medium" | "large">(() => {
    return (localStorage.getItem("tgcd_grid_box_size") as "small" | "medium" | "large") || "large";
  });

  const handleSetGridBoxSize = (size: "small" | "medium" | "large") => {
    setGridBoxSize(size);
    localStorage.setItem("tgcd_grid_box_size", size);
  };

  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setShowSortDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [selectionState, setSelectionState] = useState<{
    folderId: number | null;
    ids: Set<number>;
  }>({ folderId: activeFolderId, ids: new Set() });
  const selectedFileIds =
    selectionState.folderId === activeFolderId ? selectionState.ids : new Set<number>();

  const mainRef = useRef<HTMLElement | null>(null);
  const mobileFileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounter = useRef(0);
  const [isDraggingPage, setIsDraggingPage] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const handleToggleSelect = (id: number) => {
    setSelectionState((prevState) => {
      const prev = prevState.folderId === activeFolderId ? prevState.ids : new Set<number>();
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return { folderId: activeFolderId, ids: copy };
    });
  };

  const activeFolder = topics.find((t) => t.id === activeFolderId) ?? null;
  const displayedTopics = searchQuery ? filterTopics(searchQuery) : topics;
  const matchingFiles = searchQuery
    ? allFiles.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  let filtered = searchQuery ? filterFiles(searchQuery) : files;

  const getFileCategory = (fileName: string): string => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
    if (["mp4", "webm", "ogg", "mov"].includes(ext)) return "video";
    if (["mp3", "wav", "m4a", "flac", "ogg"].includes(ext)) return "audio";
    if (["pdf", "docx", "xlsx", "xls", "csv", "txt", "md", "json", "zip", "rar"].includes(ext)) return "document";
    return "other";
  };

  if (selectedCategory !== "all") {
    filtered = filtered.filter((f) => getFileCategory(f.name) === selectedCategory);
  }

  const displayedFiles = [...filtered].sort((a, b) => {
    let comp = 0;
    if (sortBy === "name") comp = a.name.localeCompare(b.name);
    else if (sortBy === "size") comp = a.size - b.size;
    else if (sortBy === "date") comp = a.date - b.date;
    return sortOrder === "asc" ? comp : -comp;
  });

  const handleToggleSelectAll = () => {
    const filesToSelect = activeFolderId === null ? matchingFiles : displayedFiles;
    setSelectionState((prevState) => {
      const prev = prevState.folderId === activeFolderId ? prevState.ids : new Set<number>();
      const allSelected = filesToSelect.length > 0 && filesToSelect.every((f) => prev.has(f.id));
      const copy = new Set(prev);
      if (allSelected) filesToSelect.forEach((f) => copy.delete(f.id));
      else filesToSelect.forEach((f) => copy.add(f.id));
      return { folderId: activeFolderId, ids: copy };
    });
  };

  const selectedFiles = (activeFolderId === null ? allFiles : files).filter((f) => selectedFileIds.has(f.id));

  const handleBatchDelete = () => {
    if (selectedFiles.length === 0) return;
    if (triggerConfirm) {
      triggerConfirm(
        "Delete Selected Files",
        `Are you sure you want to delete all ${selectedFiles.length} selected files from Telegram cloud storage?`,
        async () => {
          const ok = await onDeleteFilesBatch(selectedFiles);
          if (ok) {
            setSelectionState({ folderId: activeFolderId, ids: new Set() });
            triggerToast?.("Successfully deleted selected files.", "success");
          } else {
            triggerToast?.("Failed to delete some selected files.", "error");
          }
        }
      );
    }
  };

  const handleBatchDownload = async () => {
    if (selectedFiles.length === 0) return;
    if (onDownloadFilesBatch) {
      await onDownloadFilesBatch(selectedFiles);
      setSelectionState({ folderId: activeFolderId, ids: new Set() });
      return;
    }
    for (const file of selectedFiles) {
      try {
        await onDownload(file);
      } catch {
        // ignore single file failure
      }
    }
    setSelectionState({ folderId: activeFolderId, ids: new Set() });
  };

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeFolderId]);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current++;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDraggingPage(true);
      }
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current === 0) setIsDraggingPage(false);
    };
    const handleDragOver = (e: DragEvent) => e.preventDefault();
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingPage(false);
      dragCounter.current = 0;
      const droppedFiles = Array.from(e.dataTransfer?.files || []);
      if (droppedFiles.length > 0) onFileDrop(droppedFiles);
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [onFileDrop]);

  return (
    <div className="h-screen max-h-screen overflow-hidden bg-white dark:bg-[#212121] flex flex-col relative transition-colors duration-300">
      <FloatingTransferWidget
        uploads={uploads}
        downloadProgress={downloadProgress}
        onCancelUpload={onCancelUpload}
        onCancelDownload={onCancelDownload}
      />

      {isDraggingPage && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/40 border-[3px] border-dashed border-[#0494f4]/80 m-4 rounded-3xl animate-fade-in pointer-events-none"
          style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
        >
          <p className="text-white text-xl font-black tracking-tight">Drop files anywhere to upload</p>
          <p className="text-surface-300 text-xs font-bold uppercase tracking-wider mt-1.5 opacity-80">Upload instantly to your active folder</p>
        </div>
      )}

      <Header
        driveTitle={driveConfig.chatTitle}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onLogout={onLogout}
        userProfile={userProfile}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onAddAccount={onAddAccount}
        onSwitchAccount={onSwitchAccount}
        onRemoveAccount={onRemoveAccount}
        theme={theme}
        setTheme={setTheme}
        onMenuClick={() => setShowMobileSidebar(true)}
        onOpenReceiveShare={() => onOpenReceiveShare?.()}
        fileSharingEnabled={fileSharingEnabled}
        onToggleFileSharing={onToggleFileSharing}
        onJoinUpdateChannel={onJoinUpdateChannel}
        joiningChannel={joiningChannel}
        onClearCache={onClearCache}
        onOpenSettingsModal={() => setShowSettingsModal(true)}
        ssoUser={ssoUser}
        ssoAccounts={ssoAccounts}
        ssoActiveId={ssoActiveId}
        authuser={authuser}
        onSwitchSsoAccount={onSwitchSsoAccount}
        onSignOutSsoSlot={onSignOutSsoSlot}
        onSignOutAllSso={onSignOutAllSso}
        onUnlinkVault={onUnlinkVault}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          folders={topics}
          activeFolderId={activeFolderId}
          onFolderClick={onFolderClick}
          onCreateFolder={() => setShowCreateFolder(true)}
          onBackToRoot={onBackToRoot}
          allFiles={allFiles}
          indexing={indexing}
          indexingProgress={indexingProgress}
          onJoinUpdateChannel={onJoinUpdateChannel}
          joiningChannel={joiningChannel}
          onOpenReceiveShare={() => onOpenReceiveShare?.()}
        />

        <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-5 lg:p-8">
          <Breadcrumb
            folderName={activeFolder?.title ?? null}
            onBackToRoot={onBackToRoot}
          />

          {activeFolderId === null ? (
            <DashboardRootSection
              client={client} driveConfig={driveConfig} searchQuery={searchQuery}
              recentFiles={recentFiles} displayedTopics={displayedTopics} matchingFiles={matchingFiles}
              allFiles={allFiles} loadingFiles={loadingFiles} selectedFileIds={selectedFileIds}
              favouriteChunks={favouriteChunks} gridBoxSize={gridBoxSize} onPreview={onPreview}
              onRecentContextMenu={handleRecentContextMenu}
              onShowCreateFolder={() => setShowCreateFolder(true)}
              onFolderClick={onFolderClick} onRenameFolder={onRenameFolder} onDeleteFolder={onDeleteFolder}
              onDownload={(f) => void onDownload(f)} onRenameFile={onRenameFile} onDeleteFile={onDeleteFile}
              onToggleSelect={handleToggleSelect} onToggleSelectAll={handleToggleSelectAll}
              onToggleLike={onToggleLike} onShare={onShare}
              onOpenMoveCopy={(filesToMove) => setMoveCopyTarget({ open: true, files: filesToMove })}
              onOpenDetails={(file) => setInfoModalFile(file)}
            />
          ) : (
            <div className="space-y-8">
              <UploadZone onDrop={onFileDrop} onImportShareHash={(hash) => onOpenReceiveShare?.(hash)} />
              <div className="space-y-6">
                <FolderFilterSortBar
                  selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory}
                  sortBy={sortBy}
                  onSelectSortBy={(opt) => { setSortBy(opt); setShowSortDropdown(false); }}
                  sortOrder={sortOrder}
                  onToggleSortOrder={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                  gridBoxSize={gridBoxSize}
                  onCycleGridBoxSize={() => {
                    const nextSize = gridBoxSize === "large" ? "small" : gridBoxSize === "small" ? "medium" : "large";
                    handleSetGridBoxSize(nextSize);
                  }}
                  showSortDropdown={showSortDropdown}
                  onToggleSortDropdown={() => setShowSortDropdown(!showSortDropdown)}
                  sortDropdownRef={sortDropdownRef}
                />
                <div className="pt-4 border-t border-surface-300/40 dark:border-surface-300/10">
                  <h2 className="text-sm font-extrabold uppercase tracking-widest text-surface-600 mb-5">
                    Files
                    <span className="text-[10px] font-bold text-surface-500 ml-2 bg-surface-200/60 dark:bg-surface-300/15 px-2 py-0.5 rounded-full font-mono border border-surface-300/10">
                      {displayedFiles.length}
                    </span>
                  </h2>
                  <FileGrid
                    client={client} driveConfig={driveConfig} files={displayedFiles}
                    loading={loadingFiles} onDownload={(f) => void onDownload(f)} onPreview={onPreview}
                    onRename={onRenameFile} onDelete={onDeleteFile} selectedFileIds={selectedFileIds}
                    onToggleSelect={handleToggleSelect} onToggleSelectAll={handleToggleSelectAll}
                    favouriteChunks={favouriteChunks} onToggleLike={onToggleLike} onShare={onShare}
                    onOpenMoveCopy={(filesToMove) => setMoveCopyTarget({ open: true, files: filesToMove })}
                    onOpenDetails={(file) => setInfoModalFile(file)} gridBoxSize={gridBoxSize}
                  />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <FloatingSelectionDock
        selectedCount={selectedFileIds.size}
        onMoveCopy={() => {
          const sel = displayedFiles.filter((f) => selectedFileIds.has(f.id));
          if (sel.length > 0) setMoveCopyTarget({ open: true, files: sel });
        }}
        onBatchDownload={() => void handleBatchDownload()}
        onBatchDelete={handleBatchDelete}
        onCancelSelection={() => setSelectionState({ folderId: activeFolderId, ids: new Set() })}
      />

      <input
        ref={mobileFileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFileDrop(Array.from(e.target.files));
            e.target.value = "";
          }
        }}
      />

      <MoveCopyModal
        open={Boolean(moveCopyTarget?.open)}
        onClose={() => setMoveCopyTarget(null)}
        files={moveCopyTarget?.files || []}
        folders={topics}
        onMove={async (targetFolderId) => {
          if (moveCopyTarget?.files && onMoveFile) {
            const ok = await onMoveFile(moveCopyTarget.files, targetFolderId);
            if (ok) setSelectionState({ folderId: activeFolderId, ids: new Set() });
          }
        }}
        onCopy={async (targetFolderId) => {
          if (moveCopyTarget?.files && onCopyFile) {
            const ok = await onCopyFile(moveCopyTarget.files, targetFolderId);
            if (ok) setSelectionState({ folderId: activeFolderId, ids: new Set() });
          }
        }}
      />

      <FileInfoModal
        open={Boolean(infoModalFile)}
        onClose={() => setInfoModalFile(null)}
        file={infoModalFile}
        onDownload={(f) => void onDownload(f)}
        onRename={onRenameFile}
      />

      {recentContextMenu.visible && recentContextMenu.file && (
        <RecentUploadContextMenu
          file={recentContextMenu.file}
          x={recentContextMenu.x}
          y={recentContextMenu.y}
          onClose={() => setRecentContextMenu((prev) => ({ ...prev, visible: false }))}
          onPreview={onPreview}
          onOpenDetails={(f) => setInfoModalFile(f)}
          onDownload={onDownload}
          onOpenMoveCopy={(filesToMove) => setMoveCopyTarget({ open: true, files: filesToMove })}
          onShare={onShare}
          onRenameFile={onRenameFile}
          onDeleteFile={onDeleteFile}
        />
      )}

      <SettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        userProfile={userProfile}
        accounts={accounts}
        activeAccountId={activeAccountId}
        allFiles={allFiles}
        onAddAccount={onAddAccount}
        onSwitchAccount={onSwitchAccount}
        onRemoveAccount={onRemoveAccount}
        onLogout={onLogout}
        onClearCache={onClearCache}
        theme={theme}
        setTheme={setTheme}
        fileSharingEnabled={fileSharingEnabled}
        onToggleFileSharing={onToggleFileSharing}
        onJoinUpdateChannel={onJoinUpdateChannel}
        joiningChannel={joiningChannel}
      />

      <CreateFolderModal
        open={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        onSubmit={onCreateFolder}
      />

      <button
        onClick={() => {
          if (activeFolderId === null) setShowCreateFolder(true);
          else mobileFileInputRef.current?.click();
        }}
        className="lg:hidden fixed bottom-10 right-6 z-40 w-14 h-14 rounded-2xl bg-brand-500 hover:bg-brand-650 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all duration-150 cursor-pointer border border-brand-600/10 focus:outline-none"
        title={activeFolderId === null ? "Create Folder" : "Upload Files"}
      >
        +
      </button>

      <MobileSidebarDrawer
        open={showMobileSidebar}
        topics={topics}
        activeFolderId={activeFolderId}
        allFiles={allFiles}
        indexing={indexing}
        indexingProgress={indexingProgress}
        onClose={() => setShowMobileSidebar(false)}
        onFolderClick={onFolderClick}
        onCreateFolder={() => setShowCreateFolder(true)}
        onBackToRoot={onBackToRoot}
        onJoinUpdateChannel={onJoinUpdateChannel}
        joiningChannel={joiningChannel}
      />
    </div>
  );
}
