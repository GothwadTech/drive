import React from "react";
import type { TelegramClient } from "@mtcute/web";
import type { DriveFile, DriveConfig } from "../../types";
import { formatBytes } from "../../lib/manifest";
import { FileCardThumbnail } from "./FileCardThumbnail";
import { formatTime } from "./previewHelpers";

interface AudioPreviewViewProps {
  file: DriveFile;
  url: string;
  isDsd: boolean;
  isDsdFile: boolean;
  dsdLoading: boolean;
  dsdError: string | null;
  dsdDecodedUrl: string | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  audioPlaying: boolean;
  setAudioPlaying: (val: boolean) => void;
  audioTime: number;
  setAudioTime: (val: number) => void;
  audioDuration: number;
  setAudioDuration: (val: number) => void;
  audioVolume: number;
  setAudioVolume: (val: number) => void;
  audioSpeed: number;
  setAudioSpeed: (val: number) => void;
  toggleAudioPlay: () => void;
  client?: TelegramClient | null;
  driveConfig?: DriveConfig | null;
}

export const AudioPreviewView: React.FC<AudioPreviewViewProps> = ({
  file,
  url,
  isDsd,
  isDsdFile,
  dsdLoading,
  dsdError,
  dsdDecodedUrl,
  audioRef,
  canvasRef,
  audioPlaying,
  setAudioPlaying,
  audioTime,
  setAudioTime,
  audioDuration,
  setAudioDuration,
  audioVolume,
  setAudioVolume,
  audioSpeed,
  setAudioSpeed,
  toggleAudioPlay,
  client,
  driveConfig,
}) => (
  <div className="w-full max-w-md mx-auto p-8 select-none">
    <div className="bg-[#111115] border border-white/[0.06] rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
      {isDsd && dsdLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-white/40 text-xs font-semibold">Decoding high-resolution DSD stream...</span>
        </div>
      ) : isDsd && dsdError ? (
        <div className="text-center py-12 space-y-3">
          <span className="text-danger/80 text-xs font-semibold block">{dsdError}</span>
        </div>
      ) : (
        <>
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 mx-auto overflow-hidden rounded-2xl border border-white/10 shadow-2xl bg-slate-900 flex items-center justify-center group">
            <FileCardThumbnail
              file={file}
              client={client}
              driveConfig={driveConfig ?? undefined}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none opacity-40 mix-blend-screen"
            />
            <div className={`z-10 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center transition-all ${audioPlaying ? "scale-90 opacity-40 hover:opacity-100" : "scale-100 shadow-lg"}`}>
              <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
          </div>

          <div className="text-center">
            <h4 className="text-white/90 text-sm font-semibold truncate px-4">{file.name}</h4>
            <p className="text-white/30 text-[10px] uppercase tracking-wider font-medium mt-1">
              {formatBytes(file.size)} • {isDsdFile ? "DSD Audio" : "Audio"}
            </p>
          </div>

          <audio
            ref={audioRef}
            src={isDsd ? (dsdDecodedUrl || "") : (url || "")}
            preload="auto"
            onTimeUpdate={() => { if (audioRef.current) setAudioTime(audioRef.current.currentTime); }}
            onLoadedMetadata={() => { if (audioRef.current) setAudioDuration(audioRef.current.duration); }}
            onEnded={() => setAudioPlaying(false)}
            className="hidden"
          />
        </>
      )}

      <div className="space-y-2">
        <div className="relative h-6 flex items-center">
          <div className="absolute left-0 right-0 h-1 rounded-full bg-white/[0.08]" />
          <div className="absolute left-0 h-1 rounded-full bg-brand-400 transition-all duration-100" style={{ width: `${audioDuration > 0 ? (audioTime / audioDuration) * 100 : 0}%` }} />
          <input
            type="range"
            min={0}
            max={audioDuration || 100}
            step={0.1}
            value={audioTime}
            onChange={(e) => {
              const t = parseFloat(e.target.value);
              if (audioRef.current) audioRef.current.currentTime = t;
              setAudioTime(t);
            }}
            className="range-native absolute inset-0 w-full"
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-white/30 tabular-nums">
          <span>{formatTime(audioTime)}</span>
          <span>{formatTime(audioDuration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 15); }}
          className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-white/50 hover:text-white/80 flex items-center justify-center transition-all cursor-pointer"
          title="Rewind 15s"
        >
          «15
        </button>

        <button
          onClick={toggleAudioPlay}
          className="w-14 h-14 rounded-full bg-brand-500 hover:bg-brand-400 text-white flex items-center justify-center shadow-lg shadow-brand-500/25 transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          {audioPlaying ? "❚❚" : "▶"}
        </button>

        <button
          onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + 15); }}
          className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-white/50 hover:text-white/80 flex items-center justify-center transition-all cursor-pointer"
          title="Forward 15s"
        >
          15»
        </button>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <span className="text-white/30 text-xs">🔊</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={audioVolume}
            onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
            className="range-native range-volume w-16"
          />
        </div>

        <button
          onClick={() => {
            const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
            const idx = speeds.indexOf(audioSpeed);
            setAudioSpeed(speeds[(idx + 1) % speeds.length]);
          }}
          className="h-6 px-2.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-[10px] font-bold text-white/50 hover:text-white/80 transition-all cursor-pointer"
          title="Playback Speed"
        >
          {audioSpeed}x
        </button>
      </div>
    </div>
  </div>
);
