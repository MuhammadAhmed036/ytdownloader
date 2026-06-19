export type JobFormat = "360" | "720" | "1080" | "mp3" | "m4a";

export type JobStatus = "queued" | "processing" | "ready" | "failed" | "expired";

export interface CreateDownloadRequest {
  url: string;
  format?: JobFormat;
}

export interface CreateDownloadResponse {
  job_id: string;
  status: JobStatus;
  format: JobFormat;
  title: string;
  thumbnail_url: string;
  created_at: string;
}

export interface DownloadStatusResponse {
  job_id: string;
  status: JobStatus;
  progress: number;
  text?: string;
  download_url: string | null;
  format: JobFormat;
  title: string;
  thumbnail_url: string;
  created_at: string;
  updated_at: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
