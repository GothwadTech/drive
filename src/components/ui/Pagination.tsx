import React from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [12, 24, 48, 96, 0],
  className = "",
}: PaginationProps) {
  if (totalItems === 0) return null;

  const isAll = pageSize === 0 || pageSize >= totalItems;
  const startItem = isAll ? 1 : Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const endItem = isAll ? totalItems : Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers array with optional ellipses
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    pages.push(1);
    if (currentPage > 3) {
      pages.push("...");
    }
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push("...");
    }
    pages.push(totalPages);
    return pages;
  };

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-4 bg-surface-100/60 dark:bg-surface-200/20 backdrop-blur-md border border-surface-300/40 dark:border-surface-300/10 rounded-2xl select-none transition-all ${className}`}
    >
      {/* Items count & Page Size selector */}
      <div className="flex items-center gap-3 text-xs font-semibold text-surface-600 dark:text-surface-700">
        <span>
          {isAll
            ? `Showing all ${totalItems} ${totalItems === 1 ? "item" : "items"}`
            : `Showing ${startItem}–${endItem} of ${totalItems} items`}
        </span>

        <div className="h-3.5 w-px bg-surface-300/40 dark:bg-surface-300/15" />

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-surface-500 font-bold">Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-surface-200 dark:bg-surface-300/10 text-surface-900 dark:text-surface-800 text-xs font-bold rounded-xl px-2 py-1 border border-surface-300/30 dark:border-surface-300/15 outline-none cursor-pointer focus:border-brand-500 transition-all"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt} className="bg-surface-100 dark:bg-surface-200 text-surface-900">
                {opt === 0 ? "All" : opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Navigation buttons */}
      {!isAll && totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          {/* Previous Button */}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 transition-all cursor-pointer border border-surface-300/30 dark:border-surface-300/15 text-surface-750 dark:text-surface-700 hover:bg-surface-200 dark:hover:bg-surface-300/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title="Previous Page"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Prev</span>
          </button>

          {/* Page Pills */}
          <div className="flex items-center gap-1">
            {getPageNumbers().map((p, idx) =>
              typeof p === "number" ? (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={`w-8 h-8 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center border select-none ${
                    currentPage === p
                      ? "bg-brand-500 text-white border-brand-500/30 shadow-md shadow-brand-500/20 scale-105"
                      : "bg-surface-200/50 dark:bg-surface-300/10 text-surface-750 dark:text-surface-700 border-transparent hover:bg-surface-200 dark:hover:bg-surface-300/20 hover:border-surface-300/30"
                  }`}
                >
                  {p}
                </button>
              ) : (
                <span key={`ellipsis-${idx}`} className="w-6 text-center text-xs text-surface-400 font-bold">
                  {p}
                </span>
              )
            )}
          </div>

          {/* Next Button */}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 transition-all cursor-pointer border border-surface-300/30 dark:border-surface-300/15 text-surface-750 dark:text-surface-700 hover:bg-surface-200 dark:hover:bg-surface-300/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title="Next Page"
          >
            <span className="hidden sm:inline">Next</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
