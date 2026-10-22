import React from "react";

interface EpubPreviewViewProps {
  loadingEpub: boolean;
  epubError: string | null;
  epubToc: Array<{ label: string; href: string }>;
  epubCurrentChapterRef: string;
  setEpubCurrentChapterRef: (href: string) => void;
  epubProgress: string;
  epubTheme: string;
  setEpubTheme: (theme: string) => void;
  epubFontSize: number;
  setEpubFontSize: React.Dispatch<React.SetStateAction<number>>;
  epubContainerRef: React.RefObject<HTMLDivElement | null>;
  renditionRef: React.RefObject<any>;
}

const themeStyles: Record<string, { bg: string; text: string; selectBg: string; border: string }> = {
  dark: {
    bg: "bg-[#121214]",
    text: "text-[#e2e8f0]",
    selectBg: "bg-[#18181b]",
    border: "border-white/[0.06]",
  },
  light: {
    bg: "bg-[#ffffff]",
    text: "text-[#18181b]",
    selectBg: "bg-[#f4f4f5]",
    border: "border-black/[0.08]",
  },
  sepia: {
    bg: "bg-[#f4ecd8]",
    text: "text-[#5c4033]",
    selectBg: "bg-[#eae0c6]",
    border: "border-[#e0d4b8]",
  },
  cream: {
    bg: "bg-[#faf6ee]",
    text: "text-[#2d241e]",
    selectBg: "bg-[#f0e6d6]",
    border: "border-[#e6dcbf]",
  },
};

export const EpubPreviewView: React.FC<EpubPreviewViewProps> = ({
  loadingEpub,
  epubError,
  epubToc,
  epubCurrentChapterRef,
  setEpubCurrentChapterRef,
  epubProgress,
  epubTheme,
  setEpubTheme,
  epubFontSize,
  setEpubFontSize,
  epubContainerRef,
  renditionRef,
}) => {
  const currentThemeStyle = themeStyles[epubTheme] || themeStyles.dark;

  return (
    <div className="w-full h-full max-w-4xl mx-auto p-2 sm:p-4 flex flex-col relative animate-fade-in select-none">
      {loadingEpub && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 gap-3 rounded-2xl">
          <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-white/50 text-xs font-semibold tracking-wider">PREPARING PAGES...</span>
        </div>
      )}
      {epubError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#121214] border border-white/[0.06] rounded-2xl">
          <p className="text-white font-semibold">{epubError}</p>
        </div>
      ) : (
        <div className={`flex-1 flex flex-col overflow-hidden ${currentThemeStyle.bg} border ${currentThemeStyle.border} rounded-2xl relative shadow-2xl transition-all duration-300`}>
          <div className={`flex items-center justify-between border-b ${currentThemeStyle.border} px-4 py-2.5 shrink-0 gap-3`}>
            {epubToc.length > 0 ? (
              <div className="flex items-center gap-2 max-w-[50%] sm:max-w-[60%]">
                <select
                  value={epubCurrentChapterRef}
                  onChange={(e) => {
                    setEpubCurrentChapterRef(e.target.value);
                    renditionRef.current?.display(e.target.value);
                  }}
                  className={`text-[11px] font-semibold tracking-wide ${currentThemeStyle.text} bg-transparent border-0 cursor-pointer focus:outline-none max-w-[140px] sm:max-w-[280px] truncate`}
                >
                  {epubToc.map((chapter, idx) => (
                    <option key={idx} value={chapter.href} className="bg-[#18181b] text-white">
                      {chapter.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className={`text-[10px] font-bold tracking-widest uppercase opacity-40 select-none ${currentThemeStyle.text}`}>
                EPUB eBook Reader
              </span>
            )}

            <div className="flex items-center gap-3">
              <div className={`flex items-center bg-black/[0.04] dark:bg-white/[0.04] border ${currentThemeStyle.border} p-0.5 rounded-lg`}>
                <button
                  onClick={() => setEpubFontSize((prev) => Math.max(70, prev - 10))}
                  disabled={epubFontSize <= 70}
                  className={`w-6 h-6 text-[10px] font-bold flex items-center justify-center rounded hover:bg-black/[0.05] dark:hover:bg-white/[0.05] disabled:opacity-20 active:scale-95 transition-all cursor-pointer ${currentThemeStyle.text}`}
                >
                  A-
                </button>
                <span className={`text-[9px] font-bold px-1.5 min-w-[32px] text-center opacity-70 ${currentThemeStyle.text}`}>
                  {epubFontSize}%
                </span>
                <button
                  onClick={() => setEpubFontSize((prev) => Math.min(180, prev + 10))}
                  disabled={epubFontSize >= 180}
                  className={`w-6 h-6 text-[10px] font-bold flex items-center justify-center rounded hover:bg-black/[0.05] dark:hover:bg-white/[0.05] disabled:opacity-20 active:scale-95 transition-all cursor-pointer ${currentThemeStyle.text}`}
                >
                  A+
                </button>
              </div>

              <div className="flex items-center gap-1">
                {(["light", "cream", "sepia", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setEpubTheme(t)}
                    className={`w-5 h-5 rounded-full border transition-all relative cursor-pointer active:scale-90 ${
                      epubTheme === t
                        ? "ring-1.5 ring-brand-400 border-transparent scale-110"
                        : "border-black/10 dark:border-white/10 hover:scale-105"
                    }`}
                    style={{
                      backgroundColor:
                        t === "light" ? "#ffffff" : t === "cream" ? "#faf6ee" : t === "sepia" ? "#f4ecd8" : "#121214",
                    }}
                    title={`${t.charAt(0).toUpperCase() + t.slice(1)} Theme`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 w-full relative flex items-center justify-between p-2 sm:p-4 overflow-hidden">
            <button
              onClick={() => renditionRef.current?.prev()}
              className={`absolute left-4 z-15 w-10 h-10 rounded-full items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 border ${currentThemeStyle.border} ${currentThemeStyle.text} transition-all shadow-md group cursor-pointer hidden md:flex`}
            >
              ‹
            </button>

            <div ref={epubContainerRef} className="flex-1 h-full w-full overflow-hidden px-4 md:px-12" />

            <button
              onClick={() => renditionRef.current?.next()}
              className={`absolute right-4 z-15 w-10 h-10 rounded-full items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 border ${currentThemeStyle.border} ${currentThemeStyle.text} transition-all shadow-md group cursor-pointer hidden md:flex`}
            >
              ›
            </button>
          </div>

          <div className={`flex items-center justify-between border-t ${currentThemeStyle.border} pt-3 mt-auto pb-1.5 px-4 shrink-0`}>
            <button
              onClick={() => renditionRef.current?.prev()}
              className={`px-3 py-1.5 text-xs font-bold ${currentThemeStyle.text} bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg active:scale-95 transition-all cursor-pointer flex md:hidden`}
            >
              Previous
            </button>
            <div className={`text-[10px] font-bold opacity-45 uppercase tracking-wider mx-auto select-none ${currentThemeStyle.text}`}>
              {epubProgress !== "0%" ? `Progress: ${epubProgress}` : "eBook Preview"}
            </div>
            <button
              onClick={() => renditionRef.current?.next()}
              className={`px-3 py-1.5 text-xs font-bold ${currentThemeStyle.text} bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg active:scale-95 transition-all cursor-pointer flex md:hidden`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
