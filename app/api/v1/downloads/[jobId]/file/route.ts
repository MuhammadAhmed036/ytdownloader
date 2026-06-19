import { NextResponse } from "next/server";
import { ApiError, getReadyDownloadFile } from "@/lib/vda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }

  return NextResponse.json(
    { error: { code: "SERVER_ERROR", message: "Server error. Please try again." } },
    { status: 500 }
  );
}

function encodeContentDispositionFilename(filename: string): string {
  const fallback = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { jobId } = await context.params;
    const file = await getReadyDownloadFile(decodeURIComponent(jobId));
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Type": file.contentType,
      "Content-Disposition": encodeContentDispositionFilename(file.filename),
    });

    if (file.contentLength) {
      headers.set("Content-Length", file.contentLength);
    }

    return new NextResponse(file.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
