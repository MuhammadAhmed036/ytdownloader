"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiRequestError, createDownload, getDownloadStatus } from "@/lib/api-client";
import { isYouTubeUrl } from "@/lib/youtube";
import type { DownloadStatusResponse, JobFormat } from "@/types/download";

type UiPhase = "idle" | "starting" | "processing" | "ready" | "error";

type FormatOption = {
  value: JobFormat;
  label: string;
  helper: string;
};

const POLL_INTERVAL_MS = 2500;

const FORMAT_OPTIONS: FormatOption[] = [
  { value: "360", label: "MP4", helper: "360p" },
  { value: "720", label: "HD", helper: "720p" },
  { value: "mp3", label: "MP3", helper: "Audio" },
  { value: "m4a", label: "M4A", helper: "Audio" },
];

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

function getFormatLabel(format: JobFormat): string {
  const match = FORMAT_OPTIONS.find((item) => item.value === format);
  return match ? `${match.label} ${match.helper}` : format.toUpperCase();
}

export default function Downloader() {
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<JobFormat>("360");
  const [phase, setPhase] = useState<UiPhase>("idle");
  const [message, setMessage] = useState("");
  const [job, setJob] = useState<DownloadStatusResponse | null>(null);
  const [progress, setProgress] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoDownloadStartedRef = useRef(false);

  const isBusy = phase === "starting" || phase === "processing";
  const trimmedUrl = url.trim();

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== "ready" || !job?.download_url || autoDownloadStartedRef.current) return;

    autoDownloadStartedRef.current = true;
    const link = document.createElement("a");
    link.href = job.download_url;
    link.download = "";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [phase, job?.download_url]);

  function clearPollTimer() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function resetState() {
    clearPollTimer();
    autoDownloadStartedRef.current = false;
    setPhase("idle");
    setMessage("");
    setJob(null);
    setProgress(0);
  }

  async function pollJob(jobId: string) {
    try {
      const latest = await getDownloadStatus(jobId);
      setJob(latest);
      setProgress(latest.progress || 0);

      if (latest.status === "ready" && latest.download_url) {
        clearPollTimer();
        setPhase("ready");
        setMessage("Ready. The file download should start automatically. Use the button below if your browser blocks it.");
        return;
      }

      if (latest.status === "failed" || latest.status === "expired") {
        throw new Error(latest.error?.message || "This video could not be prepared. Try another link.");
      }

      setPhase("processing");
      setMessage(latest.text || "Preparing your download link...");
      pollTimerRef.current = setTimeout(() => pollJob(jobId), POLL_INTERVAL_MS);
    } catch (error) {
      clearPollTimer();
      setPhase("error");
      setMessage(getErrorMessage(error));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetState();

    if (!isYouTubeUrl(trimmedUrl)) {
      setPhase("error");
      setMessage("Please paste a valid YouTube link.");
      inputRef.current?.focus();
      return;
    }

    try {
      setPhase("starting");
      setMessage("Starting download job...");
      setProgress(2);

      const created = await createDownload(trimmedUrl, format);
      const initialJob: DownloadStatusResponse = {
        ...created,
        progress: 4,
        text: "Preparing your download link...",
        download_url: null,
        updated_at: new Date().toISOString(),
      };

      setJob(initialJob);
      setPhase("processing");
      setMessage("Preparing your download link...");
      setProgress(4);
      pollJob(created.job_id);
    } catch (error) {
      setPhase("error");
      setMessage(getErrorMessage(error));
    }
  }

  function handleNewLink() {
    resetState();
    setUrl("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <section className="downloader-card" aria-labelledby="download-title">
      <div className="brand-mark" aria-hidden="true">
        <span>▶</span>
      </div>

      <p className="eyebrow">YouTube downloader</p>
      <h1 id="download-title">Paste a link. Get the file.</h1>
      <p className="hero-copy">Download MP4 video or extract audio from a YouTube link in one clean step.</p>

      <form className="download-form" onSubmit={handleSubmit} noValidate>
        <label className="sr-only" htmlFor="youtube-url">
          YouTube video link
        </label>
        <input
          ref={inputRef}
          id="youtube-url"
          value={url}
          disabled={isBusy}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Paste YouTube video link"
          onChange={(event) => {
            setUrl(event.target.value);
            if (phase === "error") {
              setPhase("idle");
              setMessage("");
            }
          }}
        />
        <button type="submit" disabled={isBusy}>
          {phase === "starting" ? "Starting..." : phase === "processing" ? "Preparing..." : "Download"}
        </button>
      </form>

      <div className="format-row" aria-label="Download format">
        {FORMAT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`format-pill ${format === option.value ? "active" : ""}`}
            disabled={isBusy}
            onClick={() => setFormat(option.value)}
          >
            <strong>{option.label}</strong>
            <span>{option.helper}</span>
          </button>
        ))}
      </div>

      <div className={`status-line ${phase === "error" ? "status-error" : ""}`} role="status" aria-live="polite">
        {message || "Paste a YouTube URL above to start."}
      </div>

      {job ? (
        <div className="result-panel">
          {job.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="video-thumb" src={job.thumbnail_url} alt="Video thumbnail" />
          ) : (
            <div className="video-thumb fallback-thumb" aria-hidden="true">
              ▶
            </div>
          )}

          <div className="result-content">
            <div className="result-title-row">
              <div className="result-title-wrap">
                <p className="result-label">{getFormatLabel(job.format)}</p>
                <h2>{job.title || "YouTube video"}</h2>
              </div>
              <span className="percent-pill">{Math.round(progress)}%</span>
            </div>

            <div className="progress-track" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${Math.max(4, Math.min(100, progress))}%` }} />
            </div>

            {phase === "ready" && job.download_url ? (
              <div className="result-actions">
                <a className="primary-link" href={job.download_url} download>
                  Download Again
                </a>
                <button className="secondary-button" type="button" onClick={handleNewLink}>
                  New Link
                </button>
              </div>
            ) : phase === "error" ? (
              <div className="result-actions">
                <button className="secondary-button full" type="button" onClick={handleNewLink}>
                  Try Another Link
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
