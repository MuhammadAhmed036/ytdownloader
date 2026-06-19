import { NextResponse } from "next/server";
import { ApiError, getDownloadJob } from "@/lib/vda";

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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { jobId } = await context.params;
    const job = await getDownloadJob(decodeURIComponent(jobId));

    return NextResponse.json(job, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
