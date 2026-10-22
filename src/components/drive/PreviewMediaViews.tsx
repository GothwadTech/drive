import React from "react";
import type { DriveFile } from "../../types";
import { formatBytes } from "../../lib/manifest";
import { clamp, formatTime } from "./previewHelpers";

interface ImagePreviewViewProps {
  file: DriveFile;
  url: string;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  panOffset: { x: number; y: number };
  setPanOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  isPanning: boolean;
  rotation: number;
  setRotation: React.Dispatch<React.SetStateAction<number>>;
  imageLoaded: boolean;
  setImageLoaded: (loaded: boolean) => void;
  onWheel: (e: React.WheelEvent) => void;
  onDoubleClick: () => void;
  onPanStart: (e: React.MouseEvent | React.TouchEvent) => void;
  onPanMove: (e: React.MouseEvent | React.TouchEvent) => void;
}

export const ImagePreviewView: React.FC<ImagePreviewViewProps> = ({
  file,
  url,
  zoom,
  setZoom,
  panOffset,
  setPanOffset,
  isPanning,
  rotation,
  setRotation,
  imageLoaded,
  setImageLoaded,
  onWheel,
  onDoubleClick,
  onPanStart,
  onPanMove,
}) => (
  <div
    className={`relative w-full h-full flex items-center justify-center overflow-hidden ${
      zoom > 1 ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
    }`}
    onWheel={onWheel}
    onDoubleClick={onDoubleClick}
    onMouseDown={onPanStart}
    onMouseMove={onPanMove}
    onTouchStart={onPanStart}
    onTouchMove={onPanMove}
  >
    {!imageLoaded && (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-48 h-48 rounded-2xl bg-white/[0.04] animate-pulse" />
      </div>
    )}
    <img
      src={url}
      alt={file.name}
      loading="eager"
      decoding="async"
      onLoad={() => setImageLoaded(true)}
      className="max-w-full max-h-full object-contain select-none"
      style={{
        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
        transition: isPanning ? "none" : "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        opacity: imageLoaded ? 1 : 0,
      }}
      draggable={false}
    />

    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/70 backdrop-blur-md rounded-full px-2 py-1.5 shadow-2xl border border-white/[0.08]">
      <button onClick={() => setZoom((z) => clamp(z - 0.25, 0.25, 5))} className="w-8 h-8 rounded-full hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer" title="Zoom Out (-)">
        −
      </button>
      <span className="text-[11px] font-semibold text-white/70 tabular-nums w-12 text-center select-none">
        {Math.round(zoom * 100)}%
      </span>
      <button onClick={() => setZoom((z) => clamp(z + 0.25, 0.25, 5))} className="w-8 h-8 rounded-full hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer" title="Zoom In (+)">
        +
      </button>
      <div className="w-px h-5 bg-white/10 mx-0.5" />
      <button onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }} className="w-8 h-8 rounded-full hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer" title="Fit (0)">
        ⊡
      </button>
      <button onClick={() => setRotation((r) => (r + 90) % 360)} className="w-8 h-8 rounded-full hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer" title="Rotate (R)">
        ↻
      </button>
    </div>
  </div>
);

interface VideoPreviewViewProps {
  file: DriveFile;
  ext: string;
  url: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoContainerRef: React.RefObject<HTMLDivElement | null>;
  ogvContainerRef: React.RefObject<HTMLDivElement | null>;
  useOgv: boolean;
  setUseOgv: (val: boolean) => void;
  videoError: string | null;
  setVideoError: (val: string | null) => void;
  videoPlaying: boolean;
  setVideoPlaying: (val: boolean) => void;
  videoTime: number;
  videoDuration: number;
  setVideoDuration: (val: number) => void;
  videoBuffered: number;
  buffering: boolean;
  setBuffering: (val: boolean) => void;
  videoVolume: number;
  setVideoVolume: (val: number) => void;
  videoMuted: boolean;
  setVideoMuted: React.Dispatch<React.SetStateAction<boolean>>;
  playbackSpeed: number;
  setPlaybackSpeed: (val: number) => void;
  showSpeedMenu: boolean;
  setShowSpeedMenu: (val: boolean) => void;
  controlsVisible: boolean;
  setControlsVisible: (val: boolean) => void;
  isFullscreen: boolean;
  seekTooltip: { x: number; time: string } | null;
  setSeekTooltip: (val: { x: number; time: string } | null) => void;
  resetControlsTimer: () => void;
  toggleVideoPlay: () => void;
  toggleFullscreen: () => void;
  togglePiP: () => void;
  onVideoTimeUpdate: () => void;
  handleVideoSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSeekTooltip: (e: React.MouseEvent<HTMLInputElement>) => void;
  onDownload?: () => void | Promise<void>;
}

export const VideoPreviewView: React.FC<VideoPreviewViewProps> = ({
  file,
  ext,
  url,
  videoRef,
  videoContainerRef,
  ogvContainerRef,
  useOgv,
  setUseOgv,
  videoError,
  setVideoError,
  videoPlaying,
  setVideoPlaying,
  videoTime,
  videoDuration,
  setVideoDuration,
  videoBuffered,
  buffering,
  setBuffering,
  videoVolume,
  setVideoVolume,
  videoMuted,
  setVideoMuted,
  playbackSpeed,
  setPlaybackSpeed,
  showSpeedMenu,
  setShowSpeedMenu,
  controlsVisible,
  setControlsVisible,
  isFullscreen,
  seekTooltip,
  setSeekTooltip,
  resetControlsTimer,
  toggleVideoPlay,
  toggleFullscreen,
  togglePiP,
  onVideoTimeUpdate,
  handleVideoSeek,
  handleSeekTooltip,
  onDownload,
}) => (
  <div
    ref={videoContainerRef}
    className="relative w-full h-full flex items-center justify-center bg-black group/video"
    onMouseMove={resetControlsTimer}
    onClick={(e) => {
      if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "VIDEO") {
        toggleVideoPlay();
        resetControlsTimer();
      }
    }}
  >
    {videoError ? (
      <div className="flex flex-col items-center justify-center text-center p-8 max-w-md bg-white/[0.04] backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl animate-spring-in">
        <h3 className="text-lg font-bold text-white mb-1">Cannot Play .{ext.toUpperCase()} Inline</h3>
        <p className="text-xs text-white/60 mb-6 leading-relaxed">{videoError}</p>
        {onDownload && (
          <button
            onClick={(e) => { e.stopPropagation(); void onDownload(); }}
            className="px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-medium text-sm flex items-center gap-2 transition-all shadow-lg cursor-pointer active:scale-95"
          >
            Download Video ({formatBytes(file.size)})
          </button>
        )}
      </div>
    ) : useOgv ? (
      <div ref={ogvContainerRef} className="w-full h-full flex items-center justify-center select-none" />
    ) : (
      <>
        <video
          ref={videoRef}
          src={url || undefined}
          autoPlay
          playsInline
          preload="auto"
          onPlay={() => { setVideoPlaying(true); resetControlsTimer(); setBuffering(false); }}
          onPause={() => { setVideoPlaying(false); setControlsVisible(true); }}
          onTimeUpdate={onVideoTimeUpdate}
          onLoadedMetadata={() => { if (videoRef.current) setVideoDuration(videoRef.current.duration); setBuffering(false); }}
          onLoadedData={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onCanPlayThrough={() => setBuffering(false)}
          onSeeking={() => setBuffering(true)}
          onSeeked={() => setBuffering(false)}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onError={() => {
            if (!useOgv) {
              setUseOgv(true);
            } else {
              setBuffering(false);
              setVideoError(`Browser native player cannot render this video codec/container (.${ext.toUpperCase()}). Please download to play.`);
            }
          }}
          className="max-w-full max-h-full object-contain"
        />

        {!videoPlaying && !buffering && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleVideoPlay(); }}
            className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/25 transition-all animate-spring-in cursor-pointer border border-white/10"
          >
            ▶
          </button>
        )}

        {buffering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        )}

        <div
          className={`absolute bottom-0 left-0 right-0 preview-controls-bar px-3 sm:px-4 pb-3 pt-16 transition-opacity duration-300 ${
            controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="relative w-full mb-2.5 group/seek">
            <div className="absolute top-1/2 -translate-y-1/2 left-0 h-1 rounded-full bg-white/[0.12] w-full" />
            <div className="absolute top-1/2 -translate-y-1/2 left-0 h-1 rounded-full bg-white/20 transition-all" style={{ width: `${videoDuration > 0 ? (videoBuffered / videoDuration) * 100 : 0}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 left-0 h-1 rounded-full bg-brand-400 transition-all" style={{ width: `${videoDuration > 0 ? (videoTime / videoDuration) * 100 : 0}%` }} />
            <input
              type="range"
              min={0}
              max={videoDuration || 100}
              step={0.1}
              value={videoTime}
              onChange={handleVideoSeek}
              onMouseMove={handleSeekTooltip}
              onMouseLeave={() => setSeekTooltip(null)}
              className="range-native absolute inset-0 w-full h-4 z-10"
            />
            {seekTooltip && (
              <div
                className="absolute -top-8 bg-black/80 text-white text-[10px] font-mono font-bold px-2 py-1 rounded-md pointer-events-none"
                style={{ left: `${seekTooltip.x}px`, transform: "translateX(-50%)" }}
              >
                {seekTooltip.time}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 select-none">
            <button onClick={(e) => { e.stopPropagation(); toggleVideoPlay(); }} className="w-9 h-9 rounded-full hover:bg-white/10 text-white flex items-center justify-center transition-all cursor-pointer active:scale-90">
              {videoPlaying ? "❚❚" : "▶"}
            </button>
            <button onClick={(e) => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); }} className="w-8 h-8 rounded-full hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer text-xs font-bold">
              «10
            </button>
            <button onClick={(e) => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 10); }} className="w-8 h-8 rounded-full hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer text-xs font-bold">
              10»
            </button>
            <span className="text-[11px] text-white/60 font-mono tabular-nums select-none">
              {formatTime(videoTime)} / {formatTime(videoDuration)}
            </span>
            <div className="flex-1" />
            <div className="hidden sm:flex items-center gap-1.5 group/vol">
              <button onClick={(e) => { e.stopPropagation(); setVideoMuted((m) => !m); }} className="w-8 h-8 rounded-full hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer">
                {videoMuted || videoVolume === 0 ? "🔇" : "🔊"}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={videoMuted ? 0 : videoVolume}
                onChange={(e) => { e.stopPropagation(); setVideoVolume(parseFloat(e.target.value)); if (videoMuted) setVideoMuted(false); }}
                onClick={(e) => e.stopPropagation()}
                className="range-native range-volume w-16 opacity-0 group-hover/vol:opacity-100 transition-opacity duration-200"
              />
            </div>

            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); }} className="h-7 px-2 rounded-md bg-white/[0.08] hover:bg-white/[0.15] text-[11px] font-bold text-white/70 hover:text-white transition-all cursor-pointer">
                {playbackSpeed}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-[#1a1a1e] border border-white/10 rounded-xl py-1.5 shadow-2xl animate-spring-in z-50 min-w-[80px]">
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={(e) => { e.stopPropagation(); setPlaybackSpeed(speed); setShowSpeedMenu(false); }}
                      className={`w-full px-3 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer ${
                        playbackSpeed === speed ? "text-brand-400 bg-brand-500/10" : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      {speed}x{speed === 1 ? " (Normal)" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {"pictureInPictureEnabled" in document && (
              <button onClick={(e) => { e.stopPropagation(); togglePiP(); }} className="w-8 h-8 rounded-full hover:bg-white/10 text-white/70 hover:text-white items-center justify-center transition-all cursor-pointer hidden sm:flex" title="Picture-in-Picture">
                ⧉
              </button>
            )}

            <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="w-8 h-8 rounded-full hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer" title="Fullscreen (F)">
              {isFullscreen ? "⤡" : "⤢"}
            </button>
          </div>
        </div>
      </>
    )}
  </div>
);
