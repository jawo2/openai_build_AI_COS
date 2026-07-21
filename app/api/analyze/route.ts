import { NextResponse } from "next/server";
import { runManager } from "@/lib/agents/manager";
import {
  NotFoundError,
  PrivateAccountError,
  RateLimitError,
  TimeoutError,
  scrapeProfile
} from "@/lib/apify";
import {
  readCachedAnalysis,
  readCachedProfile,
  writeCachedAnalysis,
  writeCachedProfile
} from "@/lib/cache";
import { getMockProfile } from "@/lib/mockData";
import type { AnalyzeResponse, CreatorProfile, DataSource, Platform } from "@/lib/types";
import { PlatformSchema } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusEvent = {
  message: string;
};

type WarningEvent = {
  message: string;
  fallback: DataSource;
};

type ErrorEvent = {
  message: string;
};

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized. Provide the demo password." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsedPlatform = PlatformSchema.safeParse(body?.platform);
  const rawHandle = body?.handle;

  if (!parsedPlatform.success || typeof rawHandle !== "string") {
    return NextResponse.json(
      { error: "Invalid request. Provide platform and handle." },
      { status: 400 }
    );
  }

  const platform = parsedPlatform.data;
  const handle = normalizeHandle(rawHandle);

  if (!handle) {
    return NextResponse.json({ error: "Handle could not be parsed." }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = <T>(event: string, payload: T) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
        );
      };

      try {
        send<StatusEvent>("status", { message: fetchingMessage(platform) });

        const { profile, dataSource, warning } = await getProfileWithFallback(platform, handle);

        if (warning) {
          send<WarningEvent>("warning", {
            message: warning,
            fallback: dataSource
          });
        }

        send<StatusEvent>("status", { message: analyzingMessage(platform) });
        send<StatusEvent>("status", { message: "Otto is thinking..." });

        const cachedAnalysis = await readCachedAnalysis(platform, handle, profile);
        const analysis = cachedAnalysis
          ? { ...cachedAnalysis.analysis, dataSource }
          : await runManager(profile, dataSource);

        if (!cachedAnalysis) {
          await writeCachedAnalysis(platform, handle, profile, analysis);
        }

        const response: AnalyzeResponse = {
          creator: profile,
          analysis,
          dataSource
        };

        send<AnalyzeResponse>("result", response);
      } catch (error) {
        send<ErrorEvent>("error", {
          message: friendlyErrorMessage(error)
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no"
    }
  });
}

async function getProfileWithFallback(
  platform: Platform,
  handle: string
): Promise<{ profile: CreatorProfile; dataSource: DataSource; warning?: string }> {
  const freshCache = await readCachedProfile(platform, handle);

  if (freshCache) {
    return {
      profile: freshCache.profile,
      dataSource: "cached"
    };
  }

  try {
    const profile = await scrapeProfile(platform, handle);
    await writeCachedProfile(platform, handle, profile);

    return {
      profile,
      dataSource: "live"
    };
  } catch (error) {
    const staleCache = await readCachedProfile(platform, handle, { ignoreTtl: true });
    const warning = friendlyErrorMessage(error);

    if (staleCache) {
      return {
        profile: staleCache.profile,
        dataSource: "cached",
        warning
      };
    }

    return {
      profile: getMockProfile(platform),
      dataSource: "demo",
      warning
    };
  }
}

function isAuthorized(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const demoPassword = process.env.DEMO_PASSWORD;

  if (!demoPassword) {
    return false;
  }

  return request.headers.get("x-demo-password") === demoPassword;
}

function fetchingMessage(platform: Platform): string {
  return platform === "tiktok"
    ? "Fetching your TikTok profile..."
    : "Fetching your Instagram profile...";
}

function analyzingMessage(platform: Platform): string {
  return platform === "tiktok"
    ? "Analyzing 12 recent videos..."
    : "Analyzing 12 recent posts...";
}

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof PrivateAccountError) {
    return "This account is private. Connect a public creator profile or use demo data.";
  }

  if (error instanceof NotFoundError) {
    return "We could not find that profile. Check the handle and try again.";
  }

  if (error instanceof TimeoutError) {
    return "The scrape took too long. Otto is falling back to the latest saved data.";
  }

  if (error instanceof RateLimitError) {
    return "The data provider is rate limited right now. Otto is falling back to saved data.";
  }

  return "Something went wrong during analysis. Otto is falling back where possible.";
}

function normalizeHandle(handle: string): string {
  return handle
    .trim()
    .replace(/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com)\//i, "")
    .replace(/^@/, "")
    .replace(/\/$/, "")
    .split("/")
    .filter(Boolean)[0]
    .toLowerCase();
}
