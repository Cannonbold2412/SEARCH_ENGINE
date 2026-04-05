"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiUpload } from "@/lib/api";

export type SarvamTranscribeResponse = {
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

type UseSarvamVoiceDictationOptions = {
  query: string;
  setQuery: (value: string) => void;
  languageCode: string;
};

export function useSarvamVoiceDictation({
  query,
  setQuery,
  languageCode,
}: UseSarvamVoiceDictationOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [chunks, setChunks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Text in the box before this recording session started. */
  const [recordBaseline, setRecordBaseline] = useState("");
  /** Live text from browser SpeechRecognition while recording. */
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

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const hasLivePreview = Boolean(getSpeechRecognitionCtor());

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
        const res = await apiUpload<SarvamTranscribeResponse>("/speech/transcribe", fd);
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
        if (text) {
          setQuery(base ? `${base} ${text}`.trim() : text);
        } else if (liveFallback) {
          setQuery(base ? `${base} ${liveFallback}`.trim() : liveFallback);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transcription failed.");
      } finally {
        setIsTranscribing(false);
        liveTranscriptRef.current = "";
        setLiveTranscript("");
        setRecordBaseline("");
        recordBaselineRef.current = "";
        speechCommittedRef.current = "";
      }
    },
    [languageCode, setQuery]
  );

  const stopRecording = useCallback(() => {
    skipUploadRef.current = false;
    stopBrowserSpeech();
    const r = recorderRef.current;
    if (!r || r.state === "inactive") {
      setIsRecording(false);
      stopStream();
      return;
    }
    r.stop();
  }, [stopBrowserSpeech, stopStream]);

  const cancelRecording = useCallback(() => {
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
  }, [stopBrowserSpeech, stopStream]);

  const startRecording = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone is not available in this browser.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("Recording is not supported in this browser.");
      return;
    }

    setError(null);
    setChunks([]);
    const baseline = queryRef.current.trimEnd();
    setRecordBaseline(baseline);
    recordBaselineRef.current = baseline;
    liveTranscriptRef.current = "";
    setLiveTranscript("");
    speechCommittedRef.current = "";

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone permission denied.");
      return;
    }
    streamRef.current = stream;

    startBrowserSpeech();

    const mime = pickRecorderMime();
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    recorderRef.current = recorder;
    const blobParts: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) blobParts.push(ev.data);
    };
    recorder.onerror = () => {
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
      setIsRecording(true);
    } catch {
      setError("Could not start recording.");
      stopBrowserSpeech();
      stopStream();
    }
  }, [startBrowserSpeech, stopBrowserSpeech, stopStream, uploadBlob]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
      return;
    }
    void startRecording();
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      stillRecordingRef.current = false;
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
        for (const t of s.getTracks()) t.stop();
      }
    };
  }, []);

  return {
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
  };
}
