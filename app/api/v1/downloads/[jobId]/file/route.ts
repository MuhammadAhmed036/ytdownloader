import { NextResponse } from "next/server";
import { ApiError, getReadyProviderUrl } from "@/lib/vda";

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
    const providerUrl = await getReadyProviderUrl(decodeURIComponent(jobId));
    return NextResponse.redirect(providerUrl, 302);
  } catch (error) {
    return errorResponse(error);
  }
}
