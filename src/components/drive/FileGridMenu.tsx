import React from "react";
import type { DriveFile } from "../../types";

interface FileGridMenuProps {
  file: DriveFile;
  x: number;
  y: number;
  isSelected: boolean;
  onClose: () => void;
  onPreview: (file: DriveFile) => void;
  onOpenDetails?: (file: DriveFile) => void;
  onDownload: (file: DriveFile) => void;
  onShare?: (file: DriveFile) => void;
  onToggleSelect?: (fileId: number) => void;
  onOpenMoveCopy?: (files: DriveFile[]) => void;
  onRename?: (file: DriveFile) => void;
  onDelete?: (file: DriveFile) => void;
}

export const FileGridMenu: React.FC<FileGridMenuProps> = ({
  file,
  x,
  y,
  isSelected,
  onClose,
  onPreview,
  onOpenDetails,
  onDownload,
  onShare,
  onToggleSelect,
  onOpenMoveCopy,
  onRename,
  onDelete,
}) => {
  return (
    <div
      className="fixed z-[100] bg-md-surface-container backdrop-blur-xl border border-md-outline-variant/30 rounded-[12px] py-2 min-w-[170px] animate-scale-in select-none text-left"
      style={{
        top: `${y}px`,
        left: `${x}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          onPreview(file);
          onClose();
        }}
        className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-md-on-surface hover:bg-md-surface-container-high flex items-center gap-2 cursor-pointer transition-colors min-h-[40px]"
      >
        <svg className="w-4 h-4 text-md-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        Open / View
      </button>

      {onOpenDetails && (
        <button
          onClick={() => {
            onOpenDetails(file);
            onClose();
          }}
          className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-md-on-surface hover:bg-md-surface-container-high flex items-center gap-2 cursor-pointer transition-colors min-h-[40px]"
        >
          <svg className="w-4 h-4 text-md-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Details
        </button>
      )}

      <button
        onClick={() => {
          onDownload(file);
          onClose();
        }}
        className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-surface-700 dark:text-surface-600 hover:bg-brand-500/10 hover:text-brand-500 flex items-center gap-2 cursor-pointer transition-colors"
      >
        <svg className="w-4 h-4 text-surface-450 dark:text-surface-550" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download
      </button>

      {onShare && (
        <button
          onClick={() => {
            onShare(file);
            onClose();
          }}
          className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-surface-700 dark:text-surface-600 hover:bg-brand-500/10 hover:text-brand-500 flex items-center gap-2 cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 text-surface-450 dark:text-surface-550" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Share File
        </button>
      )}

      {onToggleSelect && (
        <button
          onClick={() => {
            onToggleSelect(file.id);
            onClose();
          }}
          className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-surface-700 dark:text-surface-600 hover:bg-brand-500/10 hover:text-brand-500 flex items-center gap-2 cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 text-surface-450 dark:text-surface-550" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {isSelected ? "Deselect" : "Select"}
        </button>
      )}

      {onOpenMoveCopy && (
        <button
          onClick={() => {
            onOpenMoveCopy([file]);
            onClose();
          }}
          className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-surface-700 dark:text-surface-600 hover:bg-brand-500/10 hover:text-brand-500 flex items-center gap-2 cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 text-surface-450 dark:text-surface-550" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          Move / Copy
        </button>
      )}

      {(onRename || onDelete || onOpenMoveCopy) && (
        <div className="h-[1px] bg-md-outline-variant/30 my-1" />
      )}

      {onRename && (
        <button
          onClick={() => {
            onRename(file);
            onClose();
          }}
          className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-surface-700 dark:text-surface-600 hover:bg-brand-500/10 hover:text-brand-500 flex items-center gap-2 cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 text-surface-450 dark:text-surface-550" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
          Rename
        </button>
      )}

      {onDelete && (
        <button
          onClick={() => {
            onDelete(file);
            onClose();
          }}
          className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-md-error hover:bg-md-error-container/30 flex items-center gap-2 cursor-pointer transition-colors min-h-[40px]"
        >
          <svg className="w-4 h-4 text-md-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      )}
    </div>
  );
};
