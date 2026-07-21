import { NextResponse } from "next/server";
import { reportError } from "@/lib/monitoring/report-error";
import type { ApiError } from "@/types/api";

/**
 * Wraps a route handler so any unexpected thrown error becomes a
 * structured ApiError response (visible in the browser network tab and
 * console) instead of Vercel's bare, bodyless 500. The error is also
 * reported via reportError so it still shows up in Vercel's function logs
 * for full detail (stack trace etc.), and would reach a real monitoring
 * provider automatically if one is ever wired in there.
 */
export function withApiErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      reportError("Unhandled API error", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      const body: ApiError = {
        error: {
          code: "INTERNAL_ERROR",
          message: `Something went wrong on the server: ${message}`,
        },
      };
      return NextResponse.json(body, { status: 500 });
    }
  };
}
