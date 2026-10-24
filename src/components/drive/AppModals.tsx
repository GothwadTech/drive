import React, { Suspense, lazy } from "react";
import type { TelegramClient } from "@mtcute/web";
import type { DriveConfig, DriveFile, TopicFolder } from "../../types";
import { MoveCopyModal } from "./MoveCopyModal";
import { ShareModal } from "./ShareModal";
import { ReceiveShareModal } from "./ReceiveShareModal";
import { RenameModal } from "./RenameModal";
import { Modal } from "../ui/Modal";

const PreviewModal = lazy(() =>
  import("./PreviewModal").then((m) => ({ default: m.PreviewModal }))
);

interface AppModalsProps {
  client: TelegramClient | null;
  driveConfig: DriveConfig | null;
  topics: TopicFolder[];
  activeFolderId: number | null;
  authuser: number;
  previewFile: DriveFile | null;
  previewUrl: string | null;
  previewProgress: number | null;
  previewError: string | null;
  favouriteChunks: Set<string>;
  onToggleLike: (file: DriveFile) => void;
  onDownload: (file: DriveFile) => void | Promise<void>;
  onClosePreview: () => void;
  previewMoveCopyFile: DriveFile | null;
  setPreviewMoveCopyFile: (file: DriveFile | null) => void;
  onMoveFile: (files: DriveFile[], targetFolderId: number) => Promise<boolean>;
  onCopyFile: (files: DriveFile[], targetFolderId: number) => Promise<boolean>;
  sharingFile: DriveFile | null;
  setSharingFile: (file: DriveFile | null) => void;
  receiveShareOpen: boolean;
  receiveShareHash: string;
  workerUrl: string;
  onCloseReceiveShare: () => void;
  onReceiveShareSuccess: (targetTopicId?: number | null) => void;
  renameTarget: {
    type: "file" | "folder";
    file?: DriveFile;
    folder?: TopicFolder;
  } | null;
  setRenameTarget: (target: null) => void;
  onConfirmRename: (newName: string) => void | Promise<void>;
  showJoinPrompt: boolean;
  joiningChannel: boolean;
  onSkipJoinChannel: () => void;
  onJoinUpdateChannel: () => void | Promise<void>;
  toast: {
    show: boolean;
    message: string;
    type: "success" | "error" | "info";
  };
  confirmState: {
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  };
  onCloseConfirm: () => void;
}

export const AppModals: React.FC<AppModalsProps> = ({
  client,
  driveConfig,
  topics,
  activeFolderId,
  authuser,
  previewFile,
  previewUrl,
  previewProgress,
  previewError,
  favouriteChunks,
  onToggleLike,
  onDownload,
  onClosePreview,
  previewMoveCopyFile,
  setPreviewMoveCopyFile,
  onMoveFile,
  onCopyFile,
  sharingFile,
  setSharingFile,
  receiveShareOpen,
  receiveShareHash,
  workerUrl,
  onCloseReceiveShare,
  onReceiveShareSuccess,
  renameTarget,
  setRenameTarget,
  onConfirmRename,
  showJoinPrompt,
  joiningChannel,
  onSkipJoinChannel,
  onJoinUpdateChannel,
  toast,
  confirmState,
  onCloseConfirm,
}) => (
  <>
    {previewFile && (
      <Suspense fallback={null}>
        <PreviewModal
          key={previewFile.id}
          file={previewFile}
          client={client}
          driveConfig={driveConfig}
          url={previewUrl}
          progress={previewProgress}
          error={previewError}
          isLiked={favouriteChunks.has(previewFile.manifest.chunks.join(","))}
          onToggleLike={() => onToggleLike(previewFile)}
          onOpenMoveCopy={() => setPreviewMoveCopyFile(previewFile)}
          onDownload={() => onDownload(previewFile)}
          onClose={onClosePreview}
        />
      </Suspense>
    )}

    {previewMoveCopyFile && (
      <MoveCopyModal
        open={Boolean(previewMoveCopyFile)}
        onClose={() => setPreviewMoveCopyFile(null)}
        files={[previewMoveCopyFile]}
        folders={topics}
        onMove={async (targetFolderId) => {
          if (previewMoveCopyFile) await onMoveFile([previewMoveCopyFile], targetFolderId);
        }}
        onCopy={async (targetFolderId) => {
          if (previewMoveCopyFile) await onCopyFile([previewMoveCopyFile], targetFolderId);
        }}
      />
    )}

    {sharingFile && (
      <ShareModal
        file={sharingFile}
        driveConfig={driveConfig}
        authuser={authuser}
        onClose={() => setSharingFile(null)}
      />
    )}

    {receiveShareOpen && (
      <ReceiveShareModal
        initialHash={receiveShareHash}
        workerUrl={workerUrl}
        driveConfig={driveConfig}
        topics={topics}
        activeFolderId={activeFolderId}
        onClose={onCloseReceiveShare}
        onSuccess={onReceiveShareSuccess}
      />
    )}

    {renameTarget && (
      <RenameModal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        initialName={
          renameTarget.type === "folder"
            ? renameTarget.folder?.title || ""
            : renameTarget.file?.name || ""
        }
        itemType={renameTarget.type}
        onSubmit={onConfirmRename}
      />
    )}

    <Modal open={showJoinPrompt} onClose={onSkipJoinChannel} title="Join our Update Channel">
      <div className="space-y-4 text-center sm:text-left select-none">
        <p className="text-sm text-surface-650 dark:text-surface-600 leading-relaxed font-semibold">
          Stay informed with the latest features, releases, and service announcements for Gothwad Drive.
        </p>
        <div className="flex items-center justify-center sm:justify-start gap-2 bg-brand-500/10 text-brand-450 dark:text-brand-400 px-3.5 py-2.5 rounded-2xl border border-brand-500/15 font-bold text-xs">
          <span>Official Channel:</span>
          <span className="font-mono">@gothwadtech</span>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
          <button
            onClick={onSkipJoinChannel}
            disabled={joiningChannel}
            className="px-4.5 py-2.5 rounded-2xl bg-surface-200 dark:bg-surface-300/20 text-surface-700 dark:text-surface-650 text-xs font-bold active:scale-95 transition-all hover:bg-surface-300/50 cursor-pointer"
          >
            No thanks
          </button>
          <button
            onClick={() => void onJoinUpdateChannel()}
            disabled={joiningChannel}
            className="px-5 py-2.5 rounded-2xl bg-brand-500 hover:bg-brand-650 text-white text-xs font-bold shadow-md shadow-brand-500/10 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {joiningChannel ? "Joining..." : "Join"}
          </button>
        </div>
      </div>
    </Modal>

    {toast.show && (
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-slide-down pointer-events-none select-none max-w-[90vw] md:max-w-md w-full px-4">
        <div className="glass rounded-2xl p-4 flex items-center gap-3 border border-surface-300/40 dark:border-surface-300/10 shadow-2xl glow-brand">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              toast.type === "success"
                ? "bg-success/10 text-success"
                : toast.type === "error"
                  ? "bg-danger/10 text-danger"
                  : "bg-brand-500/10 text-brand-500"
            }`}
          >
            {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ⓘ"}
          </div>
          <p className="text-xs font-bold text-surface-900 leading-tight flex-1">{toast.message}</p>
        </div>
      </div>
    )}

    <Modal open={confirmState.show} onClose={onCloseConfirm} title={confirmState.title}>
      <div className="space-y-4 text-center sm:text-left select-none">
        <p className="text-sm text-surface-650 dark:text-surface-600 leading-relaxed font-semibold">
          {confirmState.message}
        </p>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
          <button
            onClick={onCloseConfirm}
            className="px-4.5 py-2.5 rounded-2xl bg-surface-200 dark:bg-surface-300/20 text-surface-700 dark:text-surface-650 text-xs font-bold active:scale-95 transition-all hover:bg-surface-300/50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => void confirmState.onConfirm()}
            className="px-5 py-2.5 rounded-2xl bg-danger hover:bg-danger-600 text-white text-xs font-bold shadow-md shadow-danger/10 active:scale-95 transition-all cursor-pointer"
          >
            Confirm
          </button>
        </div>
      </div>
    </Modal>
  </>
);
