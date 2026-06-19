import type {
  ApiErrorResponse,
  CreateDownloadResponse,
  DownloadStatusResponse,
  JobFormat,
} from "@/types/download";

export class ApiRequestError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }
}

async function parseApiError(response: Response): Promise<never> {
  let payload: ApiErrorResponse | null = null;

  try {
    payload = (await response.json()) as ApiErrorResponse;
  } catch {
    payload = null;
  }

  throw new ApiRequestError(
    payload?.error?.code || "REQUEST_FAILED",
    payload?.error?.message || "Request failed. Please try again.",
    response.status
  );
}

export async function createDownload(url: string, format: JobFormat = "360"): Promise<CreateDownloadResponse> {
  const response = await fetch("/api/v1/downloads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, format }),
  });

  if (!response.ok) {
    await parseApiError(response);
  }

  return (await response.json()) as CreateDownloadResponse;
}

export async function getDownloadStatus(jobId: string): Promise<DownloadStatusResponse> {
  const response = await fetch(`/api/v1/downloads/${encodeURIComponent(jobId)}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    await parseApiError(response);
  }

  return (await response.json()) as DownloadStatusResponse;
}
