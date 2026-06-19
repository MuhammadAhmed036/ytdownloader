import { NextResponse } from "next/server";
import { ApiError, createDownloadJob } from "@/lib/vda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  url?: unknown;
  format?: unknown;
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const url = typeof body.url === "string" ? body.url : "";
    const format = typeof body.format === "string" ? body.format : undefined;
    const created = await createDownloadJob(url, format);

    return NextResponse.json(created, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
