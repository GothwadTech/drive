import React, { useEffect } from "react";
import type { DriveFile } from "../../types";
import { type SheetRow, loadScript, decodeDsfToWav } from "./previewHelpers";

interface TextPreviewViewProps {
  isTextLoading: boolean;
  textContent: string | null;
}

export const TextPreviewView: React.FC<TextPreviewViewProps> = ({ isTextLoading, textContent }) => (
  <div className="w-full h-full max-w-4xl mx-auto p-3 sm:p-4 overflow-auto">
    <div className="bg-[#0d1117] border border-white/[0.06] rounded-xl overflow-hidden min-h-full">
      {isTextLoading ? (
        <div className="flex items-center justify-center p-20 gap-3">
          <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-white/40 text-sm">Loading document...</span>
        </div>
      ) : (
        <div className="flex text-xs font-mono leading-relaxed">
          <div className="select-none text-right pr-3 pl-3 py-4 text-white/15 border-r border-white/[0.04] bg-white/[0.02] shrink-0 sticky left-0">
            {(textContent || "").split("\n").map((_, i) => (
              <div key={i} className="leading-relaxed">{i + 1}</div>
            ))}
          </div>
          <pre className="whitespace-pre-wrap p-4 text-white/75 select-text flex-1 min-w-0 overflow-x-auto">
            {textContent || "(Empty file)"}
          </pre>
        </div>
      )}
    </div>
  </div>
);

interface PdfPreviewViewProps {
  file: DriveFile;
  url: string;
  onDownload?: () => void | Promise<void>;
}

export const PdfPreviewView: React.FC<PdfPreviewViewProps> = ({ file, url, onDownload }) => (
  <div className="w-full h-full max-w-5xl mx-auto p-2 sm:p-4 flex flex-col">
    <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-[#141414] border border-white/[0.06] rounded-t-xl">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
      </div>
      <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1 flex-1 min-w-0">
        <span className="text-[11px] font-semibold text-white/50 truncate">{file.name}</span>
        <span className="text-[9px] font-bold text-red-400/80 bg-red-500/10 border border-red-500/15 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
          PDF
        </span>
      </div>
      {onDownload && (
        <button
          onClick={() => void onDownload()}
          className="h-7 px-3 rounded-lg bg-white/[0.06] hover:bg-brand-500/20 text-[10px] font-bold text-white/50 hover:text-brand-400 transition-all cursor-pointer flex items-center gap-1.5"
        >
          Save
        </button>
      )}
    </div>
    <div className="flex-1 min-h-0 bg-[#111] border-x border-b border-white/[0.06] rounded-b-xl overflow-hidden shadow-2xl">
      <iframe
        src={`${url}#toolbar=0&navpanes=0`}
        className="w-full h-full border-0 bg-[#111]"
        title={file.name}
      />
    </div>
  </div>
);

interface SheetPreviewViewProps {
  isSheetLoading: boolean;
  sheetNames: string[];
  activeSheetIndex: number;
  sheetData: SheetRow[] | null;
  onSheetSwitch: (index: number) => void;
}

export const SheetPreviewView: React.FC<SheetPreviewViewProps> = ({
  isSheetLoading,
  sheetNames,
  activeSheetIndex,
  sheetData,
  onSheetSwitch,
}) => (
  <div className="w-full h-full max-w-5xl mx-auto p-2 sm:p-4 flex flex-col text-left">
    {isSheetLoading ? (
      <div className="flex-1 flex items-center justify-center gap-3">
        <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-white/40 text-sm font-medium">Parsing spreadsheet data...</span>
      </div>
    ) : (
      <>
        {sheetNames.length > 0 && (
          <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1 shrink-0">
            {sheetNames.map((name, index) => (
              <button
                key={name}
                onClick={() => onSheetSwitch(index)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                  activeSheetIndex === index
                    ? "bg-brand-500 text-white shadow-md"
                    : "bg-white/[0.06] text-white/50 hover:text-white/80 hover:bg-white/[0.1]"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-auto rounded-xl border border-white/[0.06] bg-[#0d1117]">
          {sheetData && sheetData.length > 0 ? (
            <table className="w-full border-collapse text-left text-xs text-white/75">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#161b22] border-b border-white/[0.06] divide-x divide-white/[0.04]">
                  <th className="px-3 py-2.5 text-center text-white/30 font-bold w-10">#</th>
                  {sheetData[0].map((_, colIdx) => (
                    <th key={colIdx} className="px-3 py-2.5 text-white/40 font-bold min-w-[125px] tracking-wide text-[10px] uppercase">
                      {String.fromCharCode(65 + (colIdx % 26)) + (colIdx >= 26 ? Math.floor(colIdx / 26) : "")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {sheetData.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-white/[0.03] divide-x divide-white/[0.03]">
                    <td className="px-3 py-1.5 text-center bg-[#161b22]/60 text-white/25 select-none font-bold w-10 text-[10px]">
                      {rowIdx + 1}
                    </td>
                    {row.map((cell, colIdx) => (
                      <td key={colIdx} className="px-3 py-1.5 truncate max-w-[200px] font-medium" title={String(cell)}>
                        {String(cell ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex items-center justify-center p-20 text-white/30 font-medium">
              No data found in this sheet
            </div>
          )}
        </div>
      </>
    )}
  </div>
);

interface DocxPreviewViewProps {
  file: DriveFile;
  loadingDocx: boolean;
  docxContainerRef: React.RefObject<HTMLDivElement | null>;
}

export const DocxPreviewView: React.FC<DocxPreviewViewProps> = ({
  file,
  loadingDocx,
  docxContainerRef,
}) => (
  <div className="w-full h-full max-w-4xl mx-auto p-2 sm:p-4 flex flex-col relative">
    {loadingDocx && (
      <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10 gap-3">
        <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-white/40 text-sm">Rendering document pages...</span>
      </div>
    )}
    <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-[#1a1a1a] border border-white/[0.06] rounded-t-xl">
      <span className="text-[11px] font-semibold text-white/50 truncate flex-1">{file.name}</span>
      <span className="text-[9px] font-bold text-blue-400/80 bg-blue-500/10 border border-blue-500/15 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
        DOCX
      </span>
    </div>
    <div className="flex-1 overflow-auto bg-[#2a2a2e] border-x border-b border-white/[0.06] rounded-b-xl">
      <div className="mx-auto my-6 sm:my-8 max-w-[720px] bg-white rounded-sm shadow-[0_2px_24px_rgba(0,0,0,0.35)] p-8 sm:p-12 md:p-16 text-left select-text min-h-[80%]">
        <style
          dangerouslySetInnerHTML={{
            __html: `
              .docx-preview-body { background: transparent !important; color: #1a1a1a !important; font-family: 'Inter', 'Georgia', serif !important; font-size: 14px !important; }
              .docx-preview-body p { margin-bottom: 0.75rem !important; line-height: 1.75 !important; color: #333 !important; }
              .docx-preview-body h1, .docx-preview-body h2, .docx-preview-body h3 { color: #111111 !important; font-weight: 700 !important; margin-top: 1.5rem !important; margin-bottom: 0.75rem !important; }
              .docx-preview-body table { width: 100% !important; border-collapse: collapse !important; margin: 1rem 0 !important; }
              .docx-preview-body td, .docx-preview-body th { border: 1px solid #ddd !important; padding: 8px !important; }
            `,
          }}
        />
        <div ref={docxContainerRef} className="w-full h-full" />
      </div>
    </div>
  </div>
);

// eslint-disable-next-line react-refresh/only-export-components
export function usePreviewDocumentLoaders(params: {
  file: DriveFile;
  url: string | null;
  isText: boolean;
  isSheet: boolean;
  isDocx: boolean;
  isDsd: boolean;
  isEpub: boolean;
  setTextContent: (v: string | null) => void;
  setWorkbookRef: (v: any) => void;
  setSheetNames: (v: string[]) => void;
  setSheetData: (v: SheetRow[] | null) => void;
  docxContainerRef: React.RefObject<HTMLDivElement | null>;
  setLoadingDocx: (v: boolean) => void;
  setDsdLoading: (v: boolean) => void;
  setDsdError: (v: string | null) => void;
  setDsdDecodedUrl: React.Dispatch<React.SetStateAction<string | null>>;
  epubContainerRef: React.RefObject<HTMLDivElement | null>;
  renditionRef: React.MutableRefObject<any>;
  setLoadingEpub: (v: boolean) => void;
  setEpubError: (v: string | null) => void;
  setEpubProgress: (v: string) => void;
  setEpubCurrentChapterRef: (v: string) => void;
}) {
  const {
    file, url, isText, isSheet, isDocx, isDsd, isEpub,
    setTextContent, setWorkbookRef, setSheetNames, setSheetData,
    docxContainerRef, setLoadingDocx, setDsdLoading, setDsdError, setDsdDecodedUrl,
    epubContainerRef, renditionRef, setLoadingEpub, setEpubError,
    setEpubProgress, setEpubCurrentChapterRef,
  } = params;

  useEffect(() => {
    if (!isText || !url) return;
    const controller = new AbortController();
    fetch(url, { headers: { Range: "bytes=0-131071" }, signal: controller.signal })
      .then((r) => (r.ok || r.status === 206 ? r.text() : Promise.reject(new Error(`Status ${r.status}`))))
      .then((txt) => setTextContent(txt.slice(0, 50000)))
      .catch(() => { if (!controller.signal.aborted) setTextContent("Unable to load text preview."); });
    return () => controller.abort();
  }, [isText, url, file.id, setTextContent]);

  useEffect(() => {
    if (!isSheet || !url) return;
    let cancelled = false;
    const controller = new AbortController();
    loadScript(["https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js"], "XLSX")
      .then(() => fetch(url, { signal: controller.signal }))
      .then((r) => r.arrayBuffer())
      .then((buffer) => {
        if (cancelled || !window.XLSX) return;
        const wb = window.XLSX.read(new Uint8Array(buffer), { type: "array" });
        setWorkbookRef(wb);
        setSheetNames(wb.SheetNames);
        const ws = wb.Sheets[wb.SheetNames[0]];
        setSheetData(window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }));
      })
      .catch(() => {});
    return () => { cancelled = true; controller.abort(); };
  }, [isSheet, url, file.id, setWorkbookRef, setSheetNames, setSheetData]);

  useEffect(() => {
    if (!isDocx || !url || !docxContainerRef.current) return;
    let cancelled = false;
    const controller = new AbortController();
    const container = docxContainerRef.current;
    setLoadingDocx(true);
    loadScript(["https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"], "JSZip")
      .then(() => loadScript(["https://cdn.jsdelivr.net/npm/docx-preview@0.1.15/dist/docx-preview.min.js"], "docx"))
      .then(() => fetch(url, { signal: controller.signal }))
      .then((r) => r.blob())
      .then((blob) => {
        if (cancelled || !container || !window.docx) return;
        container.innerHTML = "";
        return window.docx.renderAsync(blob, container, null, {
          className: "docx-preview-body",
          inWrapper: false,
          ignoreWidth: true,
          ignoreHeight: true,
        });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingDocx(false); });
    return () => { cancelled = true; controller.abort(); if (container) container.innerHTML = ""; };
  }, [isDocx, url, file.id, docxContainerRef, setLoadingDocx]);

  useEffect(() => {
    if (!isDsd || !url) return;
    let cancelled = false;
    setDsdLoading(true);
    setDsdError(null);
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("Failed to fetch DSD file"))))
      .then((buffer) => {
        if (cancelled) return;
        const blob = decodeDsfToWav(buffer);
        if (!blob) throw new Error("Failed to decode DSD file layout");
        setDsdDecodedUrl(URL.createObjectURL(blob));
        setDsdLoading(false);
      })
      .catch((err) => { if (!cancelled) { setDsdError(err.message || "Failed to decode DSD audio."); setDsdLoading(false); } });
    return () => {
      cancelled = true;
      setDsdDecodedUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [isDsd, url, setDsdLoading, setDsdError, setDsdDecodedUrl]);

  useEffect(() => {
    if (!isEpub || !url || !epubContainerRef.current) return;
    let cancelled = false;
    const controller = new AbortController();
    const container = epubContainerRef.current;
    setLoadingEpub(true);
    setEpubError(null);
    loadScript(["https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"], "JSZip")
      .then(() => loadScript(["https://cdn.jsdelivr.net/npm/epubjs@0.3.88/dist/epub.min.js"], "ePub"))
      .then(() => fetch(url, { signal: controller.signal }))
      .then((r) => r.arrayBuffer())
      .then((buffer) => {
        if (cancelled || !container || !window.ePub) return;
        container.innerHTML = "";
        const book = window.ePub(buffer);
        const rendition = book.renderTo(container, { width: "100%", height: "100%", flow: "paginated" });
        renditionRef.current = rendition;
        rendition.on("relocated", (location: any) => {
          if (!cancelled && location?.start) {
            setEpubProgress(`${Math.round((location.start.percentage || 0) * 100)}%`);
            if (location.start.href) setEpubCurrentChapterRef(location.start.href);
          }
        });
        return rendition.display();
      })
      .then(() => { if (!cancelled) setLoadingEpub(false); })
      .catch((err) => { if (!cancelled) { setEpubError(err.message || "Failed to render EPUB."); setLoadingEpub(false); } });
    return () => { cancelled = true; controller.abort(); };
  }, [isEpub, url, epubContainerRef, renditionRef, setLoadingEpub, setEpubError, setEpubProgress, setEpubCurrentChapterRef]);
}
