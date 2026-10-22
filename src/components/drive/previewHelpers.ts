export type SheetCell = string | number | boolean | Date | null | undefined;
export type SheetRow = SheetCell[];

export interface XlsxWorkbook {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}

export interface XlsxApi {
  read(data: Uint8Array, options: { type: "array" }): XlsxWorkbook;
  utils: {
    sheet_to_json(sheet: unknown, options: { header: 1; defval: string }): SheetRow[];
  };
}

export interface DocxPreviewApi {
  renderAsync(
    blob: Blob,
    container: HTMLElement,
    styleContainer: HTMLElement | null,
    options: {
      className: string;
      inWrapper: boolean;
      ignoreWidth: boolean;
      ignoreHeight: boolean;
    }
  ): Promise<void>;
}

declare global {
  interface Window {
    XLSX?: XlsxApi;
    docx?: DocxPreviewApi;
    ePub?: any;
  }
}

class BiquadFilter {
  b0: number; b1: number; b2: number;
  a1: number; a2: number;
  x1 = 0; x2 = 0;
  y1 = 0; y2 = 0;

  constructor(cutoff: number, sampleRate: number) {
    const ff = Math.min(0.45, cutoff / sampleRate);
    const ita = 1.0 / Math.tan(Math.PI * ff);
    const q = Math.sqrt(2.0);
    const den = 1.0 + q * ita + ita * ita;
    this.b0 = 1.0 / den;
    this.b1 = 2.0 / den;
    this.b2 = 1.0 / den;
    this.a1 = 2.0 * (1.0 - ita * ita) / den;
    this.a2 = (1.0 - q * ita + ita * ita) / den;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

export function decodeDsfToWav(arrayBuffer: ArrayBuffer): Blob | null {
  const view = new DataView(arrayBuffer);
  if (view.getUint32(0, true) !== 0x20445344) {
    return null;
  }

  let offset = 28;
  let sampleRate = 2822400;
  let channels = 2;
  let blockSize = 4096;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset < arrayBuffer.byteLength - 12) {
    const chunkHeader = view.getUint32(offset, true);
    const chunkSize = Number(view.getBigUint64(offset + 4, true));

    if (chunkHeader === 0x20746d66) {
      channels = view.getUint32(offset + 24, true);
      sampleRate = view.getUint32(offset + 28, true);
      if (chunkSize >= 48) {
        blockSize = view.getUint32(offset + 44, true);
      }
    } else if (chunkHeader === 0x61746164) {
      dataOffset = offset + 12;
      dataSize = chunkSize - 12;
      break;
    }
    offset += chunkSize;
  }

  if (dataOffset === 0 || dataSize === 0) return null;

  const dsdData = new Uint8Array(arrayBuffer, dataOffset, dataSize);
  const groupSize = blockSize * channels;
  const numGroups = Math.floor(dataSize / groupSize);

  const samplesPerChannelPerGroup = blockSize / 8;
  const numOutputSamples = numGroups * samplesPerChannelPerGroup;

  const pcmData = new Float32Array(numOutputSamples * channels);
  const wavSampleRate = sampleRate / 64;

  const lpFilters = Array.from({ length: channels }, () => new BiquadFilter(16000, wavSampleRate));

  let pcmIdx = 0;
  for (let g = 0; g < numGroups; g++) {
    const groupStart = g * groupSize;
    for (let s = 0; s < samplesPerChannelPerGroup; s++) {
      for (let c = 0; c < channels; c++) {
        const channelByteOffset = groupStart + (c * blockSize) + (s * 8);
        let onesCount = 0;
        for (let b = 0; b < 8; b++) {
          let temp = dsdData[channelByteOffset + b];
          while (temp > 0) {
            onesCount += temp & 1;
            temp >>= 1;
          }
        }
        const pcmVal = (onesCount / 32) - 1.0;
        pcmData[pcmIdx + c] = lpFilters[c].process(pcmVal);
      }
      pcmIdx += channels;
    }
  }

  const wavHeader = new ArrayBuffer(44);
  const wavView = new DataView(wavHeader);

  const writeString = (v: DataView, off: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      v.setUint8(off + i, str.charCodeAt(i));
    }
  };

  const wavByteRate = wavSampleRate * channels * 2;
  const wavBlockAlign = channels * 2;

  writeString(wavView, 0, "RIFF");
  wavView.setUint32(4, 36 + numOutputSamples * channels * 2, true);
  writeString(wavView, 8, "WAVE");
  writeString(wavView, 12, "fmt ");
  wavView.setUint32(16, 16, true);
  wavView.setUint16(20, 1, true);
  wavView.setUint16(22, channels, true);
  wavView.setUint32(24, wavSampleRate, true);
  wavView.setUint32(28, wavByteRate, true);
  wavView.setUint16(32, wavBlockAlign, true);
  wavView.setUint16(34, 16, true);
  writeString(wavView, 36, "data");
  wavView.setUint32(40, numOutputSamples * channels * 2, true);

  const outputBuffer = new Uint8Array(wavHeader.byteLength + numOutputSamples * channels * 2);
  outputBuffer.set(new Uint8Array(wavHeader), 0);

  const outView = new DataView(outputBuffer.buffer);
  let outOffset = 44;
  for (let i = 0; i < pcmData.length; i++) {
    const pcmSample = Math.max(-32768, Math.min(32767, pcmData[i] * 32767));
    outView.setInt16(outOffset, pcmSample, true);
    outOffset += 2;
  }

  return new Blob([outputBuffer], { type: "audio/wav" });
}

export function formatTime(time: number): string {
  if (isNaN(time) || !isFinite(time)) return "0:00";
  const hrs = Math.floor(time / 3600);
  const mins = Math.floor((time % 3600) / 60);
  const secs = Math.floor(time % 60);
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function loadScript(srcs: string | string[], globalCheckName?: string): Promise<void> {
  const sources = Array.isArray(srcs) ? srcs : [srcs];

  if (globalCheckName && (window as any)[globalCheckName]) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    for (const src of sources) {
      if (document.querySelector(`script[src="${src}"]`)) {
        if (!globalCheckName || (window as any)[globalCheckName]) {
          resolve();
          return;
        }
      }
    }

    let index = 0;
    function tryNext() {
      if (index >= sources.length) {
        reject(new Error(`Failed to load script from all sources: ${sources.join(", ")}`));
        return;
      }
      const src = sources[index];
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => {
        if (globalCheckName && !(window as any)[globalCheckName]) {
          try { document.head.removeChild(script); } catch {}
          index++;
          tryNext();
        } else {
          resolve();
        }
      };
      script.onerror = () => {
        try { document.head.removeChild(script); } catch {}
        index++;
        tryNext();
      };
      document.head.appendChild(script);
    }
    tryNext();
  });
}
