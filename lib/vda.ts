import type {
  CreateDownloadResponse,
  DownloadStatusResponse,
  JobFormat,
} from "@/types/download";
import { isYouTubeUrl, normalizeYouTubeUrl } from "@/lib/youtube";

const SUPPORTED_FORMATS = new Set<JobFormat>(["360", "720", "1080", "mp3", "m4a"]);
const AUDIO_FORMATS = new Set<JobFormat>(["mp3", "m4a"]);

type VdaStartResponse = {
  success?: boolean | number | string;
  id?: string;
  progress_url?: string;
  title?: string;
  text?: string;
  message?: string;
  info?: {
    title?: string;
    image?: string;
    thumbnail?: string;
  };
};

type VdaProgressResponse = {
  success?: boolean | number | string;
  progress?: number | string;
  text?: string;
  status?: string;
  message?: string;
  finished?: boolean;
  error?: string;
  download_url?: string;
  downloadUrl?: string;
  alternative_download_urls?: string[];
};

type JobToken = {
  progress_url: string;
  title: string;
  thumbnail_url: string;
  format: JobFormat;
  created_at: string;
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function getApiKey(): string {
  const apiKey = process.env.VDA_API_KEY?.trim();
  if (!apiKey) {
    throw new ApiError(500, "MISSING_API_KEY", "VDA_API_KEY is missing in .env.local.");
  }
  return apiKey;
}

function getProviderHost(): string {
  return (process.env.VDA_API_HOST || "https://p.savenow.to").trim().replace(/\/$/, "");
}

function getDefaultFormat(): JobFormat {
  const value = (process.env.DEFAULT_FORMAT || process.env.VDA_DEFAULT_FORMAT || "360") as JobFormat;
  return SUPPORTED_FORMATS.has(value) ? value : "360";
}

function getDownloadEndpoint(): string {
  const host = getProviderHost();
  const envUrl = process.env.VDA_DOWNLOAD_URL?.trim();

  // The uploaded working Python backend uses /ajax/download.php. Keep that as the canonical default.
  if (!envUrl || envUrl.includes("/api/v2/download")) {
    return `${host}/ajax/download.php`;
  }

  if (/^https?:\/\//i.test(envUrl)) return envUrl;
  return `${host}${envUrl.startsWith("/") ? envUrl : `/${envUrl}`}`;
}

function getProgressEndpointFromJobId(jobId: string): string {
  const host = getProviderHost();
  const envUrl = process.env.VDA_PROGRESS_URL?.trim();

  // The uploaded working Python backend uses /ajax/progress without .php. Keep that as the canonical default.
  if (!envUrl || envUrl.includes("/progress.php")) {
    return `${host}/ajax/progress?id=${encodeURIComponent(jobId)}`;
  }

  const progressUrl = /^https?:\/\//i.test(envUrl)
    ? new URL(envUrl)
    : new URL(envUrl.startsWith("/") ? `${host}${envUrl}` : `${host}/${envUrl}`);

  progressUrl.searchParams.set("id", jobId);
  return progressUrl.toString();
}

function encodeJobToken(token: JobToken): string {
  return Buffer.from(JSON.stringify(token), "utf8").toString("base64url");
}

function decodeJobToken(jobId: string): JobToken | null {
  try {
    const parsed = JSON.parse(Buffer.from(jobId, "base64url").toString("utf8")) as JobToken;

    if (!parsed || !parsed.progress_url || !parsed.format || !parsed.created_at) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function normalizeSuccess(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1" || value === "true" || value === "True" || value === "yes") {
    return true;
  }

  if (value === false || value === 0 || value === "0" || value === "false" || value === "False" || value === "no") {
    return false;
  }

  return null;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 60000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 VDA Downloader",
      },
      cache: "no-store",
      redirect: "follow",
    });

    const text = await response.text();
    let json: T;

    try {
      json = text ? (JSON.parse(text) as T) : (null as T);
    } catch {
      throw new Error(`Provider returned non-JSON response. HTTP=${response.status}, body=${text.slice(0, 220)}`);
    }

    if (!response.ok) {
      throw new Error(`Provider HTTP ${response.status}`);
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

function absoluteProviderUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const host = getProviderHost();
  if (url.startsWith("/")) return `${host}${url}`;
  return `${host}/${url}`;
}

function getOutputExtension(format: JobFormat): string {
  return AUDIO_FORMATS.has(format) ? format : "mp4";
}

function sanitizeFilename(name: string, fallback = "video"): string {
  const cleaned = (name || fallback)
    .replace(/[\\/*?:"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 170);

  return cleaned || fallback;
}

function getProviderDownloadUrl(data: VdaProgressResponse): string | null {
  return (
    data.download_url ||
    data.downloadUrl ||
    data.alternative_download_urls?.find(Boolean) ||
    null
  );
}

function normalizeProgress(value: number | string | undefined): number {
  const raw = Number(value ?? 0);
  if (!Number.isFinite(raw)) return 0;

  // VDA usually returns 0..1000 where 500 means 50%.
  if (raw > 100) return Math.max(0, Math.min(100, Math.round(raw / 10)));
  return Math.max(0, Math.min(100, Math.round(raw)));
}

async function startProviderJob(videoUrl: string, format: JobFormat, apiKey: string): Promise<{ data: VdaStartResponse; progressUrl: string }> {
  const requestUrl = new URL(getDownloadEndpoint());
  requestUrl.searchParams.set("format", format);
  requestUrl.searchParams.set("url", videoUrl);
  requestUrl.searchParams.set("apikey", apiKey);
  requestUrl.searchParams.set("add_info", process.env.VDA_ADD_INFO || "1");

  const allowExtendedDuration = process.env.VDA_ALLOW_EXTENDED_DURATION || "0";
  if (allowExtendedDuration) {
    requestUrl.searchParams.set("allow_extended_duration", allowExtendedDuration);
  }

  const maxDuration = process.env.VDA_MAX_DURATION?.trim();
  if (maxDuration) {
    requestUrl.searchParams.set("max_duration", maxDuration);
  }

  const data = await fetchJsonWithTimeout<VdaStartResponse>(requestUrl.toString(), 60000);
  const success = normalizeSuccess(data.success);

  // Match the uploaded Python backend: only reject when success is explicitly false.
  if (success === false) {
    throw new Error(data.text || data.message || "VDA rejected the download job.");
  }

  if (!data.id) {
    throw new Error("VDA response did not return a job id.");
  }

  return {
    data,
    progressUrl: getProgressEndpointFromJobId(data.id),
  };
}

async function checkProgress(progressUrl: string): Promise<VdaProgressResponse> {
  return fetchJsonWithTimeout<VdaProgressResponse>(progressUrl, 60000);
}

function buildPublicDownloadUrl(jobId: string): string {
  return `/api/v1/downloads/${encodeURIComponent(jobId)}/file`;
}

function responseText(data: VdaProgressResponse, fallback: string): string {
  return data.text || data.status || data.message || fallback;
}

export async function createDownloadJob(rawUrl: string, requestedFormat?: string): Promise<CreateDownloadResponse> {
  const apiKey = getApiKey();
  const url = String(rawUrl || "").trim();
  const format = (requestedFormat || getDefaultFormat()) as JobFormat;

  if (!isYouTubeUrl(url)) {
    throw new ApiError(400, "INVALID_URL", "Please paste a valid YouTube link.");
  }

  if (!SUPPORTED_FORMATS.has(format)) {
    throw new ApiError(400, "UNSUPPORTED_FORMAT", "This format is not supported.");
  }

  try {
    const normalizedUrl = normalizeYouTubeUrl(url);
    const createdAt = new Date().toISOString();
    const { data, progressUrl } = await startProviderJob(normalizedUrl, format, apiKey);
    const title = data.title || data.info?.title || "YouTube video";
    const thumbnailUrl = data.info?.image || data.info?.thumbnail || "";

    const jobId = encodeJobToken({
      progress_url: progressUrl,
      title,
      thumbnail_url: thumbnailUrl,
      format,
      created_at: createdAt,
    });

    return {
      job_id: jobId,
      status: "queued",
      format,
      title,
      thumbnail_url: thumbnailUrl,
      created_at: createdAt,
    };
  } catch (error) {
    throw new ApiError(
      502,
      "VDA_JOB_CREATE_FAILED",
      error instanceof Error ? error.message : "Download provider rejected the job."
    );
  }
}

export async function getDownloadJob(jobId: string): Promise<DownloadStatusResponse> {
  const token = decodeJobToken(jobId);

  if (!token) {
    throw new ApiError(400, "INVALID_JOB", "Invalid download job.");
  }

  try {
    const data = await checkProgress(token.progress_url);
    const rawProgress = Number(data.progress ?? 0);
    const providerDownloadUrl = getProviderDownloadUrl(data);

    // Match the uploaded working Python backend exactly for polling:
    // - keep polling until the provider returns download_url/downloadUrl
    // - fail only when progress is -1 or an explicit error text is returned
    // Some VDA progress responses report success=0 while the job is still preparing,
    // so success=false must NOT be treated as a failure here.
    const failed = rawProgress === -1 || Boolean(data.error);
    const ready = Boolean(providerDownloadUrl);
    const progress = ready ? 100 : normalizeProgress(data.progress);

    return {
      job_id: jobId,
      status: ready ? "ready" : failed ? "failed" : "processing",
      progress,
      text: ready ? "Download is ready. Saving will start now." : responseText(data, "Preparing your download link..."),
      download_url: ready ? buildPublicDownloadUrl(jobId) : null,
      format: token.format,
      title: token.title,
      thumbnail_url: token.thumbnail_url,
      created_at: token.created_at,
      updated_at: new Date().toISOString(),
      error: failed
        ? {
            code: "VDA_PROCESSING_FAILED",
            message: data.error || responseText(data, "The provider failed to process this video."),
          }
        : undefined,
    };
  } catch (error) {
    throw new ApiError(
      502,
      "VDA_PROGRESS_FAILED",
      error instanceof Error ? error.message : "Could not check download progress."
    );
  }
}

export async function getReadyDownloadFile(jobId: string): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: string | null;
  filename: string;
}> {
  const token = decodeJobToken(jobId);

  if (!token) {
    throw new ApiError(400, "INVALID_JOB", "Invalid download job.");
  }

  const progressData = await checkProgress(token.progress_url);
  const providerDownloadUrl = absoluteProviderUrl(getProviderDownloadUrl(progressData) || undefined);

  if (!providerDownloadUrl) {
    throw new ApiError(409, "DOWNLOAD_NOT_READY", "The file is still being prepared. Please wait and try again.");
  }

  const response = await fetch(providerDownloadUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 VDA Downloader",
    },
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok || !response.body) {
    throw new ApiError(502, "FILE_FETCH_FAILED", `Provider file download failed. HTTP=${response.status}`);
  }

  return {
    body: response.body,
    contentType: response.headers.get("content-type") || (AUDIO_FORMATS.has(token.format) ? "audio/mpeg" : "video/mp4"),
    contentLength: response.headers.get("content-length"),
    filename: `${sanitizeFilename(token.title)}_${token.format}.${getOutputExtension(token.format)}`,
  };
}
