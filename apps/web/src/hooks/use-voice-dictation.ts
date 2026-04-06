"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiUpload } from "@/lib/api";
import { AUTH_TOKEN_KEY } from "@/lib/auth-flow";
import { getSpeechWebSocketUrl } from "@/lib/speech-ws";

export type SpeechTranscribeResponse = {
  transcript: string;
  chunks: string[];
  language_code?: string | null;
};

/** BCP-47 for browser SpeechRecognition (live preview while recording). */
function browserSttLang(iso: string): string {
  const m: Record<string, string> = {
    en: "en-US",
    hi: "hi-IN",
    bn: "bn-IN",
    mr: "mr-IN",
    ta: "ta-IN",
    te: "te-IN",
    kn: "kn-IN",
    ur: "ur-PK",
  };
  return m[iso.toLowerCase()] ?? "en-US";
}

function liveTextToChunks(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

/** Default: end recording after this many ms below the speech RMS threshold. */
const DEFAULT_SILENCE_QUIET_MS = 1000;
/** Normalized float PCM; tweak if silence stop is too sensitive in noisy rooms. */
const SPEECH_RMS_THRESHOLD = 0.015;

function float32Rms(input: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const s = input[i]!;
    sum += s * s;
  }
  return Math.sqrt(sum / input.length);
}

function float32ToInt16PCM(input: Float32Array): ArrayBuffer {
  const len = input.length;
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

/**
 * Second AudioContext on the same mic stream: stops the recorder path after silence.
 * (Live streaming uses RMS in the existing ScriptProcessor instead.)
 */
function startSilenceMonitorForStream(
  stream: MediaStream,
  onSilence: () => void,
  quietMs: number,
): () => void {
  const ac = new AudioContext();
  const source = ac.createMediaStreamSource(stream);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  let lastSpeech = Date.now();
  const id = window.setInterval(() => {
    analyser.getFloatTimeDomainData(data);
    const rms = float32Rms(data);
    if (rms > SPEECH_RMS_THRESHOLD) {
      lastSpeech = Date.now();
    } else if (Date.now() - lastSpeech >= quietMs) {
      window.clearInterval(id);
      void ac.close().catch(() => {});
      onSilence();
    }
  }, 100);
  void ac.resume().catch(() => {});
  return () => {
    window.clearInterval(id);
    void ac.close().catch(() => {});
  };
}

type LiveWsError = Error & { fallback?: string };

function openLiveWebSocket(ac: AudioContext, languageCode: string, token: string): Promise<WebSocket> {
  const url = getSpeechWebSocketUrl();
  if (!url) {
    return Promise.reject(Object.assign(new Error("No API URL"), { fallback: "upload" }));
  }
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = window.setTimeout(() => {
      ws.close();
      reject(Object.assign(new Error("Voice connection timed out."), { fallback: "upload" }));
    }, 15000);
    const clear = () => window.clearTimeout(timer);
    ws.onerror = () => {
      clear();
      ws.close();
      reject(Object.assign(new Error("WebSocket error"), { fallback: "upload" }));
    };
    ws.onopen = () => {
      try {
        ws.send(
          JSON.stringify({
            type: "start",
            token,
            language_code: languageCode,
            sample_rate: Math.round(ac.sampleRate),
            multilingual: true,
          }),
        );
      } catch {
        clear();
        reject(new Error("Could not start voice."));
      }
    };
    ws.onmessage = (ev) => {
      let msg: { type?: string; message?: string; fallback?: string };
      try {
        msg = JSON.parse(ev.data as string) as { type?: string; message?: string; fallback?: string };
      } catch {
        return;
      }
      if (msg.type === "ready") {
        clear();
        ws.onmessage = null;
        resolve(ws);
        return;
      }
      if (msg.type === "error") {
        clear();
        ws.close();
        reject(
          Object.assign(new Error(msg.message || "Voice error"), {
            fallback: msg.fallback,
          }) as LiveWsError,
        );
      }
    };
  });
}

/** Web Speech API constructor (standard + webkit); not always on TS's Window. */
type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognitionLike;

interface BrowserSpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((this: BrowserSpeechRecognitionLike, ev: Event) => void) | null;
  onerror: ((this: BrowserSpeechRecognitionLike, ev: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function getSpeechRecognitionCtor(): BrowserSpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type UseVoiceDictationOptions = {
  query: string;
  setQuery: (value: string) => void;
  languageCode: string;
  /**
   * When true, try Deepgram live streaming (multilingual) over `/speech/stream` first;
   * falls back to upload + browser captions if the API is not configured for Deepgram.
   */
  preferLiveStreaming?: boolean;
  /** Auto-stop after this many ms of silence below the RMS threshold (live + upload paths). */
  silenceQuietMs?: number;
};

export function useVoiceDictation({
  query,
  setQuery,
  languageCode,
  preferLiveStreaming = false,
  silenceQuietMs = DEFAULT_SILENCE_QUIET_MS,
}: UseVoiceDictationOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [chunks, setChunks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Text in the box before this recording session started. */
  const [recordBaseline, setRecordBaseline] = useState("");
  /** Live text (browser SR and/or streaming STT) while recording. */
  const [liveTranscript, setLiveTranscript] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordBaselineRef = useRef("");
  const queryRef = useRef(query);
  const stillRecordingRef = useRef(false);
  const speechRef = useRef<BrowserSpeechRecognitionLike | null>(null);
  const speechCommittedRef = useRef("");
  const liveTranscriptRef = useRef("");
  const skipUploadRef = useRef(false);

  const liveModeRef = useRef(false);
  const liveWsRef = useRef<WebSocket | null>(null);
  const liveAudioCtxRef = useRef<AudioContext | null>(null);
  const liveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const liveGainRef = useRef<GainNode | null>(null);
  const dgCommittedRef = useRef("");
  const dgInterimRef = useRef("");
  const skipLiveFinalizeRef = useRef(false);
  const uploadAbortRef = useRef<AbortController | null>(null);

  /** MediaRecorder path: interval + AudioContext from `startSilenceMonitorForStream`. */
  const silenceMonitorCleanupRef = useRef<(() => void) | null>(null);
  /** Prevents duplicate `stopRecording` from silence (audio callback + interval). */
  const silenceAutoStopRequestedRef = useRef(false);
  /** Last time mic energy was above threshold (live + upload paths). */
  const lastSpeechActivityRef = useRef(0);

  const stopRecordingRef = useRef<() => void>(() => {});

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const clearSilenceMonitor = useCallback(() => {
    silenceMonitorCleanupRef.current?.();
    silenceMonitorCleanupRef.current = null;
  }, []);

  const abortInFlightUpload = useCallback(() => {
    const controller = uploadAbortRef.current;
    uploadAbortRef.current = null;
    controller?.abort();
  }, []);

  const hasLivePreview = Boolean(preferLiveStreaming || getSpeechRecognitionCtor());

  const handleDeepgramMessage = useCallback((raw: string) => {
    let j: Record<string, unknown>;
    try {
      j = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (j.type === "Metadata") return;
    if (j.type !== "Results") return;
    const isFinal = j.is_final === true;
    const channel = j.channel as Record<string, unknown> | undefined;
    const alts = channel?.alternatives as Array<Record<string, unknown>> | undefined;
    const transcript = String(alts?.[0]?.transcript ?? "").trim();
    if (isFinal) {
      if (transcript) {
        dgCommittedRef.current = dgCommittedRef.current
          ? `${dgCommittedRef.current} ${transcript}`
          : transcript;
      }
      dgInterimRef.current = "";
    } else {
      dgInterimRef.current = transcript;
    }
    const combined = [dgCommittedRef.current, dgInterimRef.current].filter(Boolean).join(" ").trim();
    liveTranscriptRef.current = combined;
    setLiveTranscript(combined);
  }, []);

  const teardownLiveAudioGraph = useCallback(() => {
    liveModeRef.current = false;
    const proc = liveProcessorRef.current;
    const src = liveSourceRef.current;
    const gain = liveGainRef.current;
    const ac = liveAudioCtxRef.current;
    liveProcessorRef.current = null;
    liveSourceRef.current = null;
    liveGainRef.current = null;
    liveAudioCtxRef.current = null;
    try {
      if (proc) proc.onaudioprocess = null;
      src?.disconnect();
      proc?.disconnect();
      gain?.disconnect();
    } catch {
      /* ignore */
    }
    void ac?.close().catch(() => {});
  }, []);

  const disposeVoiceResources = useCallback(() => {
    abortInFlightUpload();
    silenceMonitorCleanupRef.current?.();
    silenceMonitorCleanupRef.current = null;
    stillRecordingRef.current = false;
    liveModeRef.current = false;
    const ws = liveWsRef.current;
    liveWsRef.current = null;
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    teardownLiveAudioGraph();
    const sr = speechRef.current;
    speechRef.current = null;
    if (sr) {
      sr.onend = null;
      sr.onresult = null;
      sr.onerror = null;
      try {
        sr.stop();
      } catch {
        /* ignore */
      }
    }
    const r = recorderRef.current;
    recorderRef.current = null;
    if (r) {
      r.ondataavailable = null;
      r.onstop = () => {};
      r.onerror = null;
      try {
        if (r.state !== "inactive") r.stop();
      } catch {
        /* ignore */
      }
    }
    const s = streamRef.current;
    streamRef.current = null;
    if (s) {
      for (const t of s.getTracks()) {
        t.stop();
      }
    }
  }, [abortInFlightUpload, teardownLiveAudioGraph]);

  const previewChunks = useMemo(() => {
    if (!isRecording || !liveTranscript.trim()) return [];
    return liveTextToChunks(liveTranscript);
  }, [isRecording, liveTranscript]);

  const displayValue = useMemo(() => {
    if (!isRecording) return query;
    const base = recordBaseline.trimEnd();
    const live = liveTranscript.trim();
    if (!base) return live;
    if (!live) return base;
    return `${base} ${live}`.trim();
  }, [isRecording, query, recordBaseline, liveTranscript]);

  const clearError = useCallback(() => setError(null), []);

  const resetChunks = useCallback(() => {
    setChunks([]);
    setLiveTranscript("");
    liveTranscriptRef.current = "";
    setRecordBaseline("");
    recordBaselineRef.current = "";
  }, []);

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    streamRef.current = null;
    if (s) {
      for (const t of s.getTracks()) {
        t.stop();
      }
    }
  }, []);

  const stopBrowserSpeech = useCallback(() => {
    stillRecordingRef.current = false;
    const sr = speechRef.current;
    speechRef.current = null;
    if (!sr) return;
    sr.onend = null;
    sr.onresult = null;
    sr.onerror = null;
    try {
      sr.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const startBrowserSpeech = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    speechCommittedRef.current = "";
    liveTranscriptRef.current = "";
    setLiveTranscript("");
    stillRecordingRef.current = true;
    const sr = new Ctor();
    speechRef.current = sr;
    sr.continuous = true;
    sr.interimResults = true;
    sr.lang = browserSttLang(languageCode);

    sr.onresult = (event: Event) => {
      const ev = event as unknown as {
        resultIndex: number;
        results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } };
      };
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const piece = ev.results[i][0]?.transcript ?? "";
        if (ev.results[i].isFinal) {
          speechCommittedRef.current += piece;
        } else {
          interim += piece;
        }
      }
      const full = (speechCommittedRef.current + interim).trim();
      liveTranscriptRef.current = full;
      setLiveTranscript(full);
    };

    sr.onerror = (event: Event) => {
      const errEv = event as unknown as { error: string };
      if (errEv.error === "aborted" || errEv.error === "no-speech") return;
      if (errEv.error === "not-allowed") {
        setError("Speech recognition blocked — allow the mic to see live captions.");
      }
    };

    sr.onend = () => {
      if (!stillRecordingRef.current) return;
      try {
        sr.start();
      } catch {
        /* ignore */
      }
    };

    try {
      sr.start();
    } catch {
      /* optional */
    }
  }, [languageCode]);

  const uploadBlob = useCallback(
    async (blob: Blob) => {
      if (blob.size < 256) {
        setError("Recording was too short. Try again.");
        return;
      }
      setIsTranscribing(true);
      setError(null);
      abortInFlightUpload();
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      try {
        const fd = new FormData();
        const raw = blob.type.toLowerCase();
        const buf = await blob.arrayBuffer();
        let uploadBlob: Blob;
        let ext: string;
        if (raw.includes("webm")) {
          ext = "webm";
          uploadBlob = new Blob([buf], { type: "audio/webm" });
        } else if (raw.includes("mp4") || raw.includes("m4a") || raw.includes("x-m4a")) {
          ext = "m4a";
          uploadBlob = new Blob([buf], { type: "audio/mp4" });
        } else {
          ext = "webm";
          uploadBlob = blob;
        }
        fd.append("audio_file", uploadBlob, `dictation.${ext}`);
        fd.append("language_code", languageCode);
        const res = await apiUpload<SpeechTranscribeResponse>("/speech/transcribe", fd, {
          signal: controller.signal,
        });
        const text = (res.transcript || "").trim();
        const liveFallback = liveTranscriptRef.current.trim();
        const nextChunks =
          res.chunks?.length > 0
            ? res.chunks
            : text
              ? text.split(/\s+/).filter(Boolean)
              : liveFallback
                ? liveTextToChunks(liveFallback)
                : [];
        setChunks(nextChunks);
        const base = recordBaselineRef.current.trimEnd();
        let merged: string | null = null;
        if (text) {
          merged = base ? `${base} ${text}`.trim() : text;
        } else if (liveFallback) {
          merged = base ? `${base} ${liveFallback}`.trim() : liveFallback;
        }
        if (merged) {
          setQuery(merged);
          queryRef.current = merged;
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Transcription failed.");
      } finally {
        if (uploadAbortRef.current === controller) {
          uploadAbortRef.current = null;
        }
        setIsTranscribing(false);
        liveTranscriptRef.current = "";
        setLiveTranscript("");
        setRecordBaseline("");
        recordBaselineRef.current = "";
        speechCommittedRef.current = "";
      }
    },
    [abortInFlightUpload, languageCode, setQuery],
  );

  const stopRecording = useCallback(() => {
    clearSilenceMonitor();
    if (liveModeRef.current) {
      skipLiveFinalizeRef.current = false;
      const ws = liveWsRef.current;
      liveWsRef.current = null;
      teardownLiveAudioGraph();
      stopBrowserSpeech();

      const finalizeOnce = () => {
        if (skipLiveFinalizeRef.current) {
          skipLiveFinalizeRef.current = false;
          setIsTranscribing(false);
          return;
        }
        const base = recordBaselineRef.current.trimEnd();
        const live = liveTranscriptRef.current.trim();
        if (live) {
          const merged = base ? `${base} ${live}`.trim() : live;
          setQuery(merged);
          queryRef.current = merged;
          setChunks(liveTextToChunks(live));
        }
        liveTranscriptRef.current = "";
        setLiveTranscript("");
        setRecordBaseline("");
        recordBaselineRef.current = "";
        dgCommittedRef.current = "";
        dgInterimRef.current = "";
        speechCommittedRef.current = "";
        stopStream();
        setIsRecording(false);
        setIsTranscribing(false);
      };

      setIsTranscribing(true);
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: "stop" }));
          } catch {
            /* ignore */
          }
        }
        let done = false;
        const run = () => {
          if (done) return;
          done = true;
          finalizeOnce();
        };
        const t = window.setTimeout(run, 1400);
        ws.onclose = () => {
          window.clearTimeout(t);
          run();
        };
        if (ws.readyState === WebSocket.CLOSED) {
          window.clearTimeout(t);
          run();
        }
      } else {
        finalizeOnce();
      }
      return;
    }

    skipUploadRef.current = false;
    stopBrowserSpeech();
    const r = recorderRef.current;
    if (!r || r.state === "inactive") {
      setIsRecording(false);
      stopStream();
      return;
    }
    r.stop();
  }, [clearSilenceMonitor, stopBrowserSpeech, stopStream, teardownLiveAudioGraph, setQuery]);

  const cancelRecording = useCallback(() => {
    clearSilenceMonitor();
    abortInFlightUpload();
    if (liveModeRef.current) {
      skipLiveFinalizeRef.current = true;
      liveModeRef.current = false;
      const ws = liveWsRef.current;
      liveWsRef.current = null;
      teardownLiveAudioGraph();
      stopBrowserSpeech();
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      const base = recordBaselineRef.current;
      setQuery(base);
      liveTranscriptRef.current = "";
      setLiveTranscript("");
      setRecordBaseline("");
      recordBaselineRef.current = "";
      dgCommittedRef.current = "";
      dgInterimRef.current = "";
      speechCommittedRef.current = "";
      stopStream();
      setIsRecording(false);
      setIsTranscribing(false);
      return;
    }

    skipUploadRef.current = true;
    stopBrowserSpeech();
    const r = recorderRef.current;
    if (!r || r.state === "inactive") {
      setIsRecording(false);
      stopStream();
      skipUploadRef.current = false;
      liveTranscriptRef.current = "";
      setLiveTranscript("");
      setRecordBaseline("");
      recordBaselineRef.current = "";
      speechCommittedRef.current = "";
      return;
    }
    r.stop();
  }, [abortInFlightUpload, clearSilenceMonitor, stopBrowserSpeech, stopStream, teardownLiveAudioGraph, setQuery]);

  const startRecording = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone is not available in this browser.");
      return;
    }

    clearSilenceMonitor();
    silenceAutoStopRequestedRef.current = false;
    lastSpeechActivityRef.current = Date.now();

    setError(null);
    setChunks([]);
    skipLiveFinalizeRef.current = false;
    const baseline = queryRef.current.trimEnd();
    setRecordBaseline(baseline);
    recordBaselineRef.current = baseline;
    liveTranscriptRef.current = "";
    setLiveTranscript("");
    speechCommittedRef.current = "";
    dgCommittedRef.current = "";
    dgInterimRef.current = "";

    const wsUrl = getSpeechWebSocketUrl();
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const tryLiveStreaming = Boolean(preferLiveStreaming && wsUrl && token);

    if (tryLiveStreaming) {
      const ac = new AudioContext();
      const settled = await Promise.allSettled([
        navigator.mediaDevices.getUserMedia({ audio: true }),
        openLiveWebSocket(ac, languageCode, token!),
      ]);
      const streamResult = settled[0]!;
      const wsResult = settled[1]!;

      if (streamResult.status === "rejected") {
        void ac.close().catch(() => {});
        if (wsResult.status === "fulfilled") {
          try {
            wsResult.value.close();
          } catch {
            /* ignore */
          }
        }
        setError("Microphone permission denied.");
        return;
      }

      const stream = streamResult.value;
      streamRef.current = stream;

      if (wsResult.status === "fulfilled") {
        const ws = wsResult.value;
        try {
          liveModeRef.current = true;
          liveWsRef.current = ws;
          liveAudioCtxRef.current = ac;
          ws.onmessage = (ev) => {
            handleDeepgramMessage(ev.data as string);
          };
          const source = ac.createMediaStreamSource(stream);
          const processor = ac.createScriptProcessor(4096, 1, 1);
          const gain = ac.createGain();
          gain.gain.value = 0;
          processor.onaudioprocess = (e) => {
            if (!liveModeRef.current || ws.readyState !== WebSocket.OPEN) return;
            if (silenceAutoStopRequestedRef.current) return;
            const input = e.inputBuffer.getChannelData(0);
            const rms = float32Rms(input);
            if (rms > SPEECH_RMS_THRESHOLD) {
              lastSpeechActivityRef.current = Date.now();
            } else if (Date.now() - lastSpeechActivityRef.current >= silenceQuietMs) {
              silenceAutoStopRequestedRef.current = true;
              queueMicrotask(() => stopRecordingRef.current());
            }
            try {
              ws.send(float32ToInt16PCM(input));
            } catch {
              /* ignore */
            }
          };
          source.connect(processor);
          processor.connect(gain);
          gain.connect(ac.destination);
          liveSourceRef.current = source;
          liveProcessorRef.current = processor;
          liveGainRef.current = gain;
          await ac.resume();
          // Silence countdown must start after WS/mic setup, not at startRecording() (async gap
          // can exceed silenceQuietMs and fire immediate auto-stop).
          lastSpeechActivityRef.current = Date.now();
          setIsRecording(true);
          return;
        } catch (e) {
          void ac.close().catch(() => {});
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          liveModeRef.current = false;
          liveWsRef.current = null;
          setError(e instanceof Error ? e.message : "Voice failed.");
          for (const t of stream.getTracks()) t.stop();
          streamRef.current = null;
          return;
        }
      }

      void ac.close().catch(() => {});
      const err = wsResult.reason;
      const fb =
        typeof err === "object" && err && "fallback" in err ? (err as LiveWsError).fallback : undefined;
      if (fb !== "upload") {
        setError(err instanceof Error ? err.message : "Voice failed.");
        for (const t of stream.getTracks()) t.stop();
        streamRef.current = null;
        return;
      }
    } else {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setError("Microphone permission denied.");
        return;
      }
      streamRef.current = stream;
    }

    const mediaStream = streamRef.current;
    if (!mediaStream) {
      setError("Microphone is not available.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setError("Recording is not supported in this browser.");
      stopStream();
      return;
    }

    startBrowserSpeech();

    const mime = pickRecorderMime();
    const recorder = mime
      ? new MediaRecorder(mediaStream, { mimeType: mime })
      : new MediaRecorder(mediaStream);
    recorderRef.current = recorder;
    const blobParts: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) blobParts.push(ev.data);
    };
    recorder.onerror = () => {
      clearSilenceMonitor();
      setError("Recording error.");
      setIsRecording(false);
      stopBrowserSpeech();
      stopStream();
    };
    recorder.onstop = () => {
      setIsRecording(false);
      const mt = (recorder.mimeType || mime || "").toLowerCase();
      const outType = mt.includes("mp4") || mt.includes("m4a") ? "audio/mp4" : "audio/webm";
      const blob = new Blob(blobParts, { type: outType });
      stopStream();
      recorderRef.current = null;
      const skip = skipUploadRef.current;
      skipUploadRef.current = false;
      if (skip) {
        liveTranscriptRef.current = "";
        setLiveTranscript("");
        setRecordBaseline("");
        recordBaselineRef.current = "";
        speechCommittedRef.current = "";
        return;
      }
      void uploadBlob(blob);
    };

    try {
      recorder.start(250);
      silenceMonitorCleanupRef.current = startSilenceMonitorForStream(
        mediaStream,
        () => {
          if (silenceAutoStopRequestedRef.current) return;
          silenceAutoStopRequestedRef.current = true;
          stopRecordingRef.current();
        },
        silenceQuietMs,
      );
      setIsRecording(true);
    } catch {
      setError("Could not start recording.");
      stopBrowserSpeech();
      stopStream();
    }
  }, [
    clearSilenceMonitor,
    handleDeepgramMessage,
    languageCode,
    preferLiveStreaming,
    silenceQuietMs,
    startBrowserSpeech,
    stopBrowserSpeech,
    stopStream,
    uploadBlob,
  ]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  useEffect(() => {
    const handlePageLeave = () => {
      disposeVoiceResources();
    };
    window.addEventListener("pagehide", handlePageLeave);
    window.addEventListener("beforeunload", handlePageLeave);
    return () => {
      window.removeEventListener("pagehide", handlePageLeave);
      window.removeEventListener("beforeunload", handlePageLeave);
    };
  }, [disposeVoiceResources]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
      return;
    }
    void startRecording();
  }, [isRecording, isTranscribing, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      disposeVoiceResources();
    };
  }, [disposeVoiceResources]);

  // Stabilize return object identity to prevent useEffect churn in consumers
  return useMemo(
    () => ({
      isRecording,
      isTranscribing,
      chunks,
      previewChunks,
      displayValue,
      recordBaseline,
      liveTranscript,
      hasLivePreview,
      error,
      clearError,
      resetChunks,
      toggleRecording,
      stopRecording,
      cancelRecording,
    }),
    [
      isRecording,
      isTranscribing,
      chunks,
      previewChunks,
      displayValue,
      recordBaseline,
      liveTranscript,
      hasLivePreview,
      error,
      clearError,
      resetChunks,
      toggleRecording,
      stopRecording,
      cancelRecording,
    ]
  );
}
