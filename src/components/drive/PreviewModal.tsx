import { useState, useRef, useEffect, useCallback } from "react";
import type { DriveFile, DriveConfig } from "../../types";
import type { TelegramClient } from "@mtcute/web";
import { formatBytes } from "../../lib/manifest";
import { FileIcon } from "./FileIcon";
import { type SheetRow, type XlsxWorkbook, formatTime, clamp } from "./previewHelpers";
import { ImagePreviewView, VideoPreviewView } from "./PreviewMediaViews";
import { AudioPreviewView } from "./PreviewAudioView";
import {
  TextPreviewView, PdfPreviewView, SheetPreviewView, DocxPreviewView, usePreviewDocumentLoaders,
} from "./PreviewDocumentViews";
import { EpubPreviewView } from "./PreviewEpubView";

interface PreviewModalProps {
  file: DriveFile; url: string | null; progress?: number | null; error?: string | null;
  onDownload?: () => void | Promise<void>; onClose: () => void;
  isLiked?: boolean; onToggleLike?: () => void; onOpenMoveCopy?: () => void;
  client?: TelegramClient | null; driveConfig?: DriveConfig | null;
}

export function PreviewModal({
  file,
  url,
  progress,
  error,
  onDownload,
  onClose,
  isLiked = false,
  onToggleLike,
  onOpenMoveCopy,
  client,
  driveConfig,
}: PreviewModalProps) {
  const [closing, setClosing] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [rotation, setRotation] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoBuffered, setVideoBuffered] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [videoVolume, setVideoVolume] = useState(1);
  const [videoMuted, setVideoMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [seekTooltip, setSeekTooltip] = useState<{ x: number; time: string } | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const ogvPlayerRef = useRef<any>(null);
  const ogvContainerRef = useRef<HTMLDivElement | null>(null);
  const [useOgv, setUseOgv] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(1);
  const [audioSpeed, setAudioSpeed] = useState(1);

  const [textContent, setTextContent] = useState<string | null>(null);
  const [sheetData, setSheetData] = useState<SheetRow[] | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [workbookRef, setWorkbookRef] = useState<XlsxWorkbook | null>(null);

  const [loadingDocx, setLoadingDocx] = useState(false);
  const docxContainerRef = useRef<HTMLDivElement | null>(null);

  const [dsdDecodedUrl, setDsdDecodedUrl] = useState<string | null>(null);
  const [dsdLoading, setDsdLoading] = useState(false);
  const [dsdError, setDsdError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const [loadingEpub, setLoadingEpub] = useState(false);
  const [epubError, setEpubError] = useState<string | null>(null);
  const epubContainerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<any>(null);
  const [epubToc] = useState<any[]>([]);
  const [epubCurrentChapterRef, setEpubCurrentChapterRef] = useState<string>("");
  const [epubProgress, setEpubProgress] = useState<string>("0%");
  const [epubTheme, setEpubTheme] = useState<string>("dark");
  const [epubFontSize, setEpubFontSize] = useState<number>(100);

  const [showFileInfo, setShowFileInfo] = useState(false);

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const mimeType = file.mimeType || "";

  const isImage = mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
  const isVideo = mimeType.startsWith("video/") || ["mp4", "webm", "ogg", "mov", "mkv", "avi", "3gp", "flv"].includes(ext);
  const isAudio = mimeType.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "flac", "dsf", "dff", "opus", "oga", "caf", "aac"].includes(ext);
  const isText = ["txt", "md", "json", "js", "ts", "py", "rs", "go", "html", "css", "xml"].includes(ext);
  const isPdf = mimeType === "application/pdf" || ext === "pdf";
  const isDocx = ext === "docx";
  const isSheet = ["xlsx", "xls", "csv"].includes(ext);
  const isEpub = ext === "epub";
  const isDsdFile = ["dsf", "dff"].includes(ext);
  const isDsd = false;

  const handleClose = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    if (videoRef.current) videoRef.current.pause();
    if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    setClosing(true);
    setTimeout(onClose, 280);
  }, [onClose]);

  const getActiveVideo = useCallback(() => ogvPlayerRef.current || videoRef.current, []);

  const toggleVideoPlay = useCallback(() => {
    const v = getActiveVideo();
    if (!v) return;
    if (v.paused) v.play()?.catch?.(console.error);
    else v.pause();
  }, [getActiveVideo]);

  const toggleFullscreen = useCallback(() => {
    const container = videoContainerRef.current;
    if (!container) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else container.requestFullscreen().catch(console.error);
  }, []);

  const togglePiP = useCallback(async () => {
    const video = ogvPlayerRef.current || videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if ("requestPictureInPicture" in video) await video.requestPictureInPicture();
    } catch {}
  }, []);

  const toggleAudioPlay = useCallback(() => {
    if (!audioRef.current) return;
    if (!audioCtxRef.current) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        const source = ctx.createMediaElementSource(audioRef.current);
        source.connect(analyser);
        analyser.connect(ctx.destination);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        sourceRef.current = source;
      } catch {}
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    if (audioPlaying) {
      audioRef.current.pause();
      setAudioPlaying(false);
    } else {
      audioRef.current.play().catch(console.error);
      setAudioPlaying(true);
    }
  }, [audioPlaying]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "Escape": handleClose(); break;
        case " ":
        case "k":
          e.preventDefault();
          if (isVideo) toggleVideoPlay();
          if (isAudio) toggleAudioPlay();
          break;
        case "f": if (isVideo) toggleFullscreen(); break;
        case "m": if (isVideo) setVideoMuted((m) => !m); break;
        case "ArrowLeft":
          if (isVideo && videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
          if (isAudio && audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 15);
          break;
        case "ArrowRight":
          if (isVideo && videoRef.current) videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 10);
          if (isAudio && audioRef.current) audioRef.current.currentTime = Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + 15);
          break;
        case "ArrowUp":
          e.preventDefault();
          if (isVideo) setVideoVolume((v) => clamp(v + 0.1, 0, 1));
          if (isAudio) setAudioVolume((v) => clamp(v + 0.1, 0, 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          if (isVideo) setVideoVolume((v) => clamp(v - 0.1, 0, 1));
          if (isAudio) setAudioVolume((v) => clamp(v - 0.1, 0, 1));
          break;
        case "+":
        case "=": if (isImage) setZoom((z) => clamp(z + 0.25, 0.25, 5)); break;
        case "-": if (isImage) setZoom((z) => clamp(z - 0.25, 0.25, 5)); break;
        case "0": if (isImage) { setZoom(1); setPanOffset({ x: 0, y: 0 }); } break;
        case "r": if (isImage) setRotation((r) => (r + 90) % 360); break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, isVideo, isAudio, isImage, toggleVideoPlay, toggleAudioPlay, toggleFullscreen]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        try { audioCtxRef.current.close(); } catch {}
        audioCtxRef.current = null;
      }
      analyserRef.current = null;
      sourceRef.current = null;
    };
  }, [file.id, url]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isImage) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom((z) => {
      const next = clamp(z + delta, 0.25, 5);
      if (next <= 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  }, [isImage]);

  const handleImageDoubleClick = useCallback(() => {
    if (zoom > 1) { setZoom(1); setPanOffset({ x: 0, y: 0 }); }
    else setZoom(2.5);
  }, [zoom]);

  const handlePanStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsPanning(true);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    panStart.current = { x: clientX, y: clientY, ox: panOffset.x, oy: panOffset.y };
  }, [zoom, panOffset]);

  const handlePanMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isPanning) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setPanOffset({ x: panStart.current.ox + (clientX - panStart.current.x), y: panStart.current.oy + (clientY - panStart.current.y) });
  }, [isPanning]);

  const handlePanEnd = useCallback(() => setIsPanning(false), []);

  useEffect(() => {
    const v = getActiveVideo();
    if (v) { v.volume = videoVolume; v.muted = videoMuted; }
  }, [videoVolume, videoMuted, getActiveVideo]);

  useEffect(() => {
    const v = getActiveVideo();
    if (v) v.playbackRate = playbackSpeed;
  }, [playbackSpeed, getActiveVideo]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = audioVolume; }, [audioVolume]);
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = audioSpeed; }, [audioSpeed]);

  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      const v = getActiveVideo();
      if (v && !v.paused) setControlsVisible(false);
    }, 3000);
  }, [getActiveVideo]);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const onVideoTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setVideoTime(v.currentTime);
    if (v.buffered.length > 0) setVideoBuffered(v.buffered.end(v.buffered.length - 1));
  }, []);

  const handleVideoSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = getActiveVideo();
    if (!v) return;
    const time = parseFloat(e.target.value);
    v.currentTime = time;
    setVideoTime(time);
  }, [getActiveVideo]);

  const handleSeekTooltip = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setSeekTooltip({ x: e.clientX - rect.left, time: formatTime(ratio * (videoDuration || 0)) });
  }, [videoDuration]);

  const handleSheetSwitch = (index: number) => {
    if (!workbookRef || !window.XLSX) return;
    setActiveSheetIndex(index);
    const ws = workbookRef.Sheets[workbookRef.SheetNames[index]];
    setSheetData(window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }));
  };

  usePreviewDocumentLoaders({
    file, url, isText, isSheet, isDocx, isDsd, isEpub,
    setTextContent, setWorkbookRef, setSheetNames, setSheetData,
    docxContainerRef, setLoadingDocx, setDsdLoading, setDsdError, setDsdDecodedUrl,
    epubContainerRef, renditionRef, setLoadingEpub, setEpubError,
    setEpubProgress, setEpubCurrentChapterRef,
  });

  const isTextLoading = isText && Boolean(url) && textContent === null;
  const isSheetLoading = isSheet && Boolean(url) && sheetData === null && sheetNames.length === 0;
  const fileDateStr = new Date(file.date * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center transition-none" onMouseUp={handlePanEnd} onTouchEnd={handlePanEnd}>
      <div className={`absolute inset-0 preview-overlay ${closing ? "animate-backdrop-exit" : "animate-backdrop-enter"}`} onClick={handleClose} />
      <div className={`relative w-full h-full sm:w-[calc(100%-1.5rem)] sm:h-[calc(100%-1.5rem)] sm:max-w-[1440px] sm:max-h-[960px] bg-[#0a0a0a] sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col ${closing ? "animate-preview-exit" : "animate-preview-enter"}`}>
        <div className="relative z-30 shrink-0 h-14 sm:h-[3.5rem] px-3 sm:px-4 flex items-center gap-3 bg-[#0a0a0a]/95 border-b border-white/[0.06] select-none backdrop-blur-md">
          <button onClick={handleClose} className="w-9 h-9 shrink-0 rounded-full bg-white/[0.08] hover:bg-white/[0.15] flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer" title="Close (Esc)">
            ‹
          </button>
          <div className="w-8 h-8 rounded-lg bg-white/[0.06] items-center justify-center shrink-0 hidden sm:flex">
            <FileIcon fileName={file.name} className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1 flex flex-col justify-center overflow-hidden">
            <h3 className="font-semibold text-white/95 truncate text-xs sm:text-sm leading-tight">{file.name}</h3>
            <p className="text-[10px] text-white/40 font-medium truncate mt-0.5 leading-tight">
              {formatBytes(file.size)} <span className="hidden sm:inline">• {fileDateStr}</span>
              {file.uploaderName && <span className="hidden md:inline"> • {file.uploaderName}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => setShowFileInfo(!showFileInfo)} className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${showFileInfo ? "bg-brand-500/25 text-brand-400" : "bg-white/[0.08] hover:bg-white/[0.15] text-white/60 hover:text-white/90"}`} title="File Info">ⓘ</button>
            {onToggleLike && (
              <button onClick={onToggleLike} className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${isLiked ? "bg-yellow-500/25 text-yellow-400" : "bg-white/[0.08] hover:bg-white/[0.15] text-white/60 hover:text-white/90"}`} title="Favourite">★</button>
            )}
            {onOpenMoveCopy && (
              <button onClick={onOpenMoveCopy} className="w-9 h-9 rounded-full bg-white/[0.08] hover:bg-brand-500/25 text-white/60 hover:text-brand-400 flex items-center justify-center transition-all duration-200 cursor-pointer" title="Move or Copy File">⇄</button>
            )}
            {onDownload && (
              <button onClick={() => void onDownload()} className="w-9 h-9 rounded-full bg-white/[0.08] hover:bg-brand-500/25 text-white/60 hover:text-brand-400 flex items-center justify-center transition-all duration-200 cursor-pointer" title="Download">↓</button>
            )}
            <button onClick={handleClose} className="w-9 h-9 rounded-full bg-white/[0.08] hover:bg-red-500/25 text-white/60 hover:text-red-400 flex items-center justify-center transition-all duration-200 cursor-pointer" title="Close">✕</button>
          </div>
        </div>

        {showFileInfo && (
          <div className="absolute right-4 top-16 z-40 bg-[#1a1a1e] border border-white/10 rounded-xl p-4 w-64 shadow-2xl animate-spring-in text-left space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">File Details</p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-white/50">Name</span><span className="text-white/90 font-medium truncate ml-3 text-right max-w-[140px]">{file.name}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Size</span><span className="text-white/90 font-medium">{formatBytes(file.size)}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Date</span><span className="text-white/90 font-medium">{fileDateStr}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Extension</span><span className="text-white/90 font-medium">.{ext}</span></div>
              {file.mimeType && <div className="flex justify-between"><span className="text-white/50">MIME</span><span className="text-white/90 font-medium truncate ml-3 text-right max-w-[140px]">{file.mimeType}</span></div>}
              <div className="flex justify-between"><span className="text-white/50">ID</span><span className="text-white/90 font-mono text-[10px]">{file.id}</span></div>
            </div>
          </div>
        )}

        <div className="relative flex-1 min-h-0 overflow-hidden bg-black">
          {!url ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-full max-w-sm p-8 text-center space-y-6">
                {error ? (
                  <>
                    <p className="text-white font-semibold text-base">Preview unavailable</p>
                    <p className="text-sm text-white/40 leading-relaxed">{error}</p>
                    {onDownload && (
                      <button onClick={() => void onDownload()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors active:scale-95">
                        Download Instead
                      </button>
                    )}
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-white font-semibold text-base">Preparing preview ({progress ?? 0}%)</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center overflow-hidden relative">
              {isImage && (
                <ImagePreviewView
                  file={file} url={url} zoom={zoom} setZoom={setZoom}
                  panOffset={panOffset} setPanOffset={setPanOffset} isPanning={isPanning}
                  rotation={rotation} setRotation={setRotation} imageLoaded={imageLoaded}
                  setImageLoaded={setImageLoaded} onWheel={handleWheel}
                  onDoubleClick={handleImageDoubleClick} onPanStart={handlePanStart} onPanMove={handlePanMove}
                />
              )}
              {isVideo && (
                <VideoPreviewView
                  file={file} ext={ext} url={url} videoRef={videoRef}
                  videoContainerRef={videoContainerRef} ogvContainerRef={ogvContainerRef}
                  useOgv={useOgv} setUseOgv={setUseOgv} videoError={videoError}
                  setVideoError={setVideoError} videoPlaying={videoPlaying}
                  setVideoPlaying={setVideoPlaying} videoTime={videoTime}
                  videoDuration={videoDuration} setVideoDuration={setVideoDuration}
                  videoBuffered={videoBuffered} buffering={buffering} setBuffering={setBuffering}
                  videoVolume={videoVolume} setVideoVolume={setVideoVolume}
                  videoMuted={videoMuted} setVideoMuted={setVideoMuted}
                  playbackSpeed={playbackSpeed} setPlaybackSpeed={setPlaybackSpeed}
                  showSpeedMenu={showSpeedMenu} setShowSpeedMenu={setShowSpeedMenu}
                  controlsVisible={controlsVisible} setControlsVisible={setControlsVisible}
                  isFullscreen={isFullscreen} seekTooltip={seekTooltip}
                  setSeekTooltip={setSeekTooltip} resetControlsTimer={resetControlsTimer}
                  toggleVideoPlay={toggleVideoPlay} toggleFullscreen={toggleFullscreen}
                  togglePiP={() => void togglePiP()} onVideoTimeUpdate={onVideoTimeUpdate}
                  handleVideoSeek={handleVideoSeek} handleSeekTooltip={handleSeekTooltip}
                  onDownload={onDownload}
                />
              )}
              {isAudio && (
                <AudioPreviewView
                  file={file} url={url} isDsd={isDsd} isDsdFile={isDsdFile}
                  dsdLoading={dsdLoading} dsdError={dsdError} dsdDecodedUrl={dsdDecodedUrl}
                  audioRef={audioRef} canvasRef={canvasRef} audioPlaying={audioPlaying}
                  setAudioPlaying={setAudioPlaying} audioTime={audioTime}
                  setAudioTime={setAudioTime} audioDuration={audioDuration}
                  setAudioDuration={setAudioDuration} audioVolume={audioVolume}
                  setAudioVolume={setAudioVolume} audioSpeed={audioSpeed}
                  setAudioSpeed={setAudioSpeed} toggleAudioPlay={toggleAudioPlay}
                  client={client} driveConfig={driveConfig}
                />
              )}
              {isText && <TextPreviewView isTextLoading={isTextLoading} textContent={textContent} />}
              {isPdf && <PdfPreviewView file={file} url={url} onDownload={onDownload} />}
              {isSheet && (
                <SheetPreviewView
                  isSheetLoading={isSheetLoading} sheetNames={sheetNames}
                  activeSheetIndex={activeSheetIndex} sheetData={sheetData}
                  onSheetSwitch={handleSheetSwitch}
                />
              )}
              {isDocx && <DocxPreviewView file={file} loadingDocx={loadingDocx} docxContainerRef={docxContainerRef} />}
              {isEpub && (
                <EpubPreviewView
                  loadingEpub={loadingEpub} epubError={epubError} epubToc={epubToc}
                  epubCurrentChapterRef={epubCurrentChapterRef}
                  setEpubCurrentChapterRef={setEpubCurrentChapterRef}
                  epubProgress={epubProgress} epubTheme={epubTheme} setEpubTheme={setEpubTheme}
                  epubFontSize={epubFontSize} setEpubFontSize={setEpubFontSize}
                  epubContainerRef={epubContainerRef} renditionRef={renditionRef}
                />
              )}
              {!isImage && !isVideo && !isAudio && !isText && !isPdf && !isSheet && !isDocx && !isEpub && (
                <div className="text-center p-8">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.06] flex items-center justify-center mb-4">
                    <FileIcon fileName={file.name} className="w-8 h-8" />
                  </div>
                  <p className="text-white font-semibold">No preview available</p>
                  <p className="text-white/35 text-sm mt-1">Download to view this file.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
