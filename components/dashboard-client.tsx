"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  AnalyzeResponse,
  EmailDraft,
  Insight,
  Platform,
  Recommendation,
  RecentPost
} from "@/lib/types";

type StreamEvent = {
  event: string;
  data: string;
};

export function DashboardClient() {
  const searchParams = useSearchParams();
  const platform = parsePlatform(searchParams.get("platform"));
  const handle = searchParams.get("handle") || (platform === "tiktok" ? "_offo" : "_offo98");
  const [status, setStatus] = useState(firstStatus(platform));
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeRecommendation, setActiveRecommendation] = useState<Recommendation | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    async function analyze() {
      setResult(null);
      setError(null);
      setStatus(firstStatus(platform));

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ platform, handle }),
          signal: abortController.signal
        });

        if (!response.ok || !response.body) {
          throw new Error("Unable to start analysis.");
        }

        await readEventStream(response.body, (streamEvent) => {
          const payload = JSON.parse(streamEvent.data);

          if (streamEvent.event === "status") {
            setStatus(payload.message);
          }

          if (streamEvent.event === "warning") {
            setStatus(payload.message);
          }

          if (streamEvent.event === "error") {
            setError(payload.message);
          }

          if (streamEvent.event === "result") {
            setResult(payload);
            setStatus("Ready");
          }
        });
      } catch (caughtError) {
        if (!abortController.signal.aborted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to analyze this creator."
          );
        }
      }
    }

    analyze();

    return () => abortController.abort();
  }, [handle, platform]);

  const creator = result?.creator;
  const analysis = result?.analysis;
  const thumbnails = useMemo(
    () => creator?.recentPosts.filter((post) => post.thumbnailUrl).slice(0, 3) ?? [],
    [creator]
  );
  const breakoutPost = useMemo(
    () => creator?.recentPosts.find((post) => post.isBreakout) ?? null,
    [creator]
  );

  if (!result || !creator || !analysis) {
    return (
      <main className="min-h-screen bg-paper px-6 py-7 text-ink sm:px-10">
        <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-5xl flex-col">
          <DashboardNav />
          <LoadingState platform={platform} status={status} error={error} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-5 lg:grid-cols-[300px_1fr]">
        <aside className="self-start rounded-lg border border-ink/10 bg-white p-5">
          <DashboardNav compact />
          <div className="mt-8 flex items-center gap-3">
            <Avatar creator={creator} />
            <div className="min-w-0">
              <p className="truncate text-2xl font-semibold tracking-tight">
                @{creator.handle}
              </p>
              <p className="text-sm capitalize text-ink/50">{creator.platform}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-2">
            {result.dataSource === "live" ? (
              <LiveBadge platform={creator.platform} />
            ) : (
              <span className="w-fit rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/58">
                {result.dataSource} data
              </span>
            )}
            <Metric label="Followers" value={formatNumber(creator.followerCount)} />
            <Metric label="Engagement" value={`${creator.engagementRate}%`} />
            {creator.platform === "tiktok" ? (
              <Metric label="Avg views" value={formatNumber(creator.avgViews ?? 0)} />
            ) : null}
          </div>
        </aside>

        <section className="grid gap-5">
          <section className="rounded-lg border border-ink/10 bg-white p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-signal">Today</p>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Today&apos;s Priorities
                </h1>
              </div>
              <span className="text-sm text-ink/50">{creator.engagementTrend}</span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {analysis.priorities.map((priority) => (
                <article
                  className="rounded-lg border border-ink/10 bg-paper p-4"
                  key={priority.title}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-signal">
                      {priority.agentSource}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink/60">
                      {priority.urgency}
                    </span>
                  </div>
                  <h2 className="mt-4 text-lg font-semibold tracking-tight">
                    {priority.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-ink/62">{priority.summary}</p>
                </article>
              ))}
            </div>
          </section>

          {creator.platform === "tiktok" ? (
            <TikTokSpotlight creatorAvgViews={creator.avgViews} breakoutPost={breakoutPost} />
          ) : null}

          <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <div className="rounded-lg border border-ink/10 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight">Insights</h2>
                <span className="text-sm text-ink/45">{analysis.insights.length} signals</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {analysis.insights.map((insight) => (
                  <InsightCard insight={insight} key={`${insight.metric}-${insight.trend}`} />
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <h2 className="text-xl font-semibold tracking-tight">Referenced posts</h2>
              <div className="mt-4 grid gap-3">
                {thumbnails.length > 0 ? (
                  thumbnails.map((post) => <PostThumbnail key={post.timestamp} post={post} />)
                ) : (
                  <p className="text-sm leading-6 text-ink/55">
                    No public thumbnails were returned for this scrape.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Opportunities</h2>
              <span className="text-sm text-ink/45">
                {analysis.recommendations.length} recommended
              </span>
            </div>
            <div className="mt-4 divide-y divide-ink/10">
              {analysis.recommendations.map((recommendation) => (
                <button
                  className="grid w-full gap-2 py-4 text-left transition hover:bg-ink/[0.025] sm:grid-cols-[1fr_auto]"
                  key={recommendation.title}
                  onClick={() => setActiveRecommendation(recommendation)}
                  type="button"
                >
                  <span>
                    <span className="block text-lg font-semibold tracking-tight">
                      {recommendation.title}
                    </span>
                    <span className="mt-1 block max-w-3xl text-sm leading-6 text-ink/60">
                      {recommendation.description}
                    </span>
                  </span>
                  <span className="h-fit w-fit rounded-full bg-paper px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/58">
                    {recommendation.actionType}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </section>
      </div>

      <RecommendationDrawer
        creator={creator}
        onClose={() => setActiveRecommendation(null)}
        recommendation={activeRecommendation}
      />
    </main>
  );
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const event = parseStreamEvent(chunk);

      if (event) {
        onEvent(event);
      }
    }
  }
}

function parseStreamEvent(chunk: string): StreamEvent | null {
  const event = chunk.match(/^event: (.+)$/m)?.[1];
  const data = chunk.match(/^data: (.+)$/m)?.[1];

  return event && data ? { event, data } : null;
}

function LoadingState({
  error,
  platform,
  status
}: {
  error: string | null;
  platform: Platform;
  status: string;
}) {
  const steps = [firstStatus(platform), analyzingStatus(platform), "Otto is thinking..."];

  return (
    <section className="flex flex-1 items-center justify-center py-16">
      <div className="landing-rise w-full max-w-2xl rounded-lg border border-ink/10 bg-white p-6 shadow-[0_24px_70px_rgba(17,17,17,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
          Otto is preparing your brief
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          {error ?? status}
        </h1>
        <div className="mt-8 grid gap-3">
          {steps.map((step) => {
            const isActive = step === status;
            const isDone = steps.indexOf(step) < steps.indexOf(status);

            return (
              <div
                className={`flex items-center gap-3 rounded-md border px-4 py-3 ${
                  isActive
                    ? "border-signal/40 bg-signal/[0.08]"
                    : isDone
                      ? "border-moss/20 bg-moss/[0.08]"
                      : "border-ink/10 bg-paper"
                }`}
                key={step}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isActive ? "bg-signal" : isDone ? "bg-moss" : "bg-ink/18"
                  }`}
                />
                <span className="text-sm font-medium text-ink/70">{step}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DashboardNav({ compact = false }: { compact?: boolean }) {
  return (
    <nav className="flex items-center justify-between">
      <a className="text-xl font-semibold tracking-tight" href="/">
        Otto
      </a>
      {!compact ? (
        <a className="text-sm font-medium text-ink/50 hover:text-ink" href="/">
          New profile
        </a>
      ) : null}
    </nav>
  );
}

function Avatar({ creator }: { creator: AnalyzeResponse["creator"] }) {
  if (creator.avatarUrl) {
    return (
      <img
        alt={`@${creator.handle}`}
        className="h-14 w-14 rounded-full border border-ink/10 object-cover"
        src={creator.avatarUrl}
      />
    );
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-ink/10 bg-paper text-sm font-semibold uppercase text-ink/45">
      {creator.platform.slice(0, 2)}
    </div>
  );
}

function LiveBadge({ platform }: { platform: Platform }) {
  return (
    <span className="flex w-fit items-center gap-2 rounded-full bg-moss px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white">
      <PlatformIcon platform={platform} />
      Live data - scraped just now
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-paper p-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink/42">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function TikTokSpotlight({
  breakoutPost,
  creatorAvgViews
}: {
  breakoutPost: RecentPost | null;
  creatorAvgViews: number | null;
}) {
  if (!breakoutPost) {
    return null;
  }

  return (
    <section className="grid gap-4 rounded-lg border border-ink/10 bg-ink p-5 text-white md:grid-cols-[1fr_280px]">
      <div>
        <p className="text-sm font-semibold text-white/56">TikTok breakout</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          {formatNumber(breakoutPost.views ?? 0)} views
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">
          This video is above the profile average of {formatNumber(creatorAvgViews ?? 0)} views
          and is the clearest proof point for the growth story.
        </p>
      </div>
      <PostThumbnail dark post={breakoutPost} />
    </section>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className="rounded-lg bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink/70">{insight.metric}</p>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-moss">
          {insight.trend}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink/62">{insight.interpretation}</p>
    </article>
  );
}

function PostThumbnail({ dark = false, post }: { dark?: boolean; post: RecentPost }) {
  return (
    <article
      className={`grid grid-cols-[76px_1fr] gap-3 rounded-md ${
        dark ? "bg-white/8 p-2" : "bg-paper p-2"
      }`}
    >
      {post.thumbnailUrl ? (
        <img
          alt=""
          className="h-[92px] w-[76px] rounded-[6px] object-cover"
          src={post.thumbnailUrl}
        />
      ) : (
        <div className="h-[92px] w-[76px] rounded-[6px] bg-ink/10" />
      )}
      <div className="min-w-0 py-1">
        <p className={`line-clamp-2 text-sm font-medium ${dark ? "text-white" : "text-ink"}`}>
          {post.caption || post.postType}
        </p>
        <p className={`mt-2 text-xs ${dark ? "text-white/56" : "text-ink/50"}`}>
          {post.views !== null ? `${formatNumber(post.views)} views · ` : ""}
          {post.engagementRate}% engagement
        </p>
      </div>
    </article>
  );
}

function RecommendationDrawer({
  creator,
  onClose,
  recommendation
}: {
  creator: AnalyzeResponse["creator"];
  onClose: () => void;
  recommendation: Recommendation | null;
}) {
  const [email, setEmail] = useState<EmailDraft | null>(null);
  const [emailBody, setEmailBody] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEmail(null);
    setEmailBody("");
    setIsDrafting(false);
    setEmailError(null);
    setCopied(false);
  }, [recommendation]);

  useEffect(() => {
    if (!email) {
      return;
    }

    setEmailBody("");

    let index = 0;
    const interval = window.setInterval(() => {
      index += 3;
      setEmailBody(email.body.slice(0, index));

      if (index >= email.body.length) {
        window.clearInterval(interval);
      }
    }, 18);

    return () => window.clearInterval(interval);
  }, [email]);

  if (!recommendation) {
    return null;
  }

  async function draftOutreach() {
    setIsDrafting(true);
    setEmailError(null);
    setCopied(false);

    try {
      const response = await fetch("/api/generate-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          profile: creator,
          recommendation
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to draft outreach.");
      }

      setEmail(payload);
    } catch (error) {
      setEmailError(
        error instanceof Error ? error.message : "Unable to draft outreach."
      );
    } finally {
      setIsDrafting(false);
    }
  }

  async function copyEmail() {
    if (!email) {
      return;
    }

    await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${emailBody}`);
    setCopied(true);
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close recommendation"
        className="absolute inset-0 bg-ink/30"
        onClick={onClose}
        type="button"
      />
      <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-xl flex-col overflow-y-auto bg-white p-5 shadow-[-24px_0_70px_rgba(17,17,17,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-signal">
              Opportunity
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              {recommendation.title}
            </h2>
          </div>
          <button
            className="rounded-full border border-ink/10 px-3 py-1 text-sm text-ink/60 hover:text-ink"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <p className="mt-5 text-base leading-7 text-ink/64">
          {recommendation.description}
        </p>

        <section className="mt-7">
          <h3 className="text-sm font-semibold text-ink/75">Reasoning</h3>
          <ul className="mt-3 grid gap-3">
            {recommendation.reasoning.map((reason) => (
              <li className="rounded-md bg-paper p-3 text-sm leading-6 text-ink/66" key={reason}>
                {reason}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-7">
          <h3 className="text-sm font-semibold text-ink/75">Supporting metrics</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {recommendation.supportingMetrics.map((metric) => (
              <div className="rounded-md border border-ink/10 p-3" key={metric.label}>
                <p className="text-xs font-medium text-ink/45">{metric.label}</p>
                <p className="mt-1 text-lg font-semibold">{metric.value}</p>
                <p className="text-xs text-moss">{metric.trend}</p>
              </div>
            ))}
          </div>
        </section>

        <button
          className="mt-8 min-h-12 rounded-md bg-ink px-5 text-sm font-semibold text-white transition hover:bg-ink/86 disabled:cursor-not-allowed disabled:bg-ink/35"
          disabled={isDrafting}
          onClick={draftOutreach}
          type="button"
        >
          {isDrafting ? "Drafting..." : "Draft outreach"}
        </button>

        {emailError ? (
          <p className="mt-3 rounded-md bg-signal/10 p-3 text-sm text-ink/70">
            {emailError}
          </p>
        ) : null}

        {email ? (
          <section className="mt-7 rounded-lg border border-ink/10 bg-paper p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-signal">
                  Draft email
                </p>
                <input
                  className="mt-2 w-full rounded-md border border-ink/10 bg-white px-3 py-2 text-lg font-semibold outline-none focus:border-signal sm:min-w-[360px]"
                  onChange={(event) =>
                    setEmail({
                      ...email,
                      subject: event.target.value
                    })
                  }
                  value={email.subject}
                />
              </div>
              <button
                className="h-10 rounded-md border border-ink/15 px-4 text-sm font-semibold text-ink/68 transition hover:border-ink/35 hover:text-ink"
                onClick={copyEmail}
                type="button"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <textarea
              className="mt-4 min-h-[220px] w-full resize-y rounded-md border border-ink/10 bg-white p-3 text-sm leading-6 outline-none focus:border-signal"
              onChange={(event) => setEmailBody(event.target.value)}
              value={emailBody}
            />

            <div className="mt-4 rounded-md border border-moss/20 bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-moss">
                Metric proof
              </p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-ink/68">
                {highlightMetrics(emailBody, recommendation.supportingMetrics.map((metric) => metric.value))}
              </p>
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function highlightMetrics(body: string, metrics: string[]) {
  const escapedMetrics = metrics
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);

  if (escapedMetrics.length === 0) {
    return body;
  }

  const matcher = new RegExp(`(${escapedMetrics.join("|")})`, "gi");
  const parts = body.split(matcher);

  return parts.map((part, index) => {
    const isMetric = metrics.some(
      (metric) => metric.toLowerCase() === part.toLowerCase()
    );

    return isMetric ? (
      <mark className="rounded bg-signal/15 px-1 text-ink" key={`${part}-${index}`}>
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    );
  });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function PlatformIcon({ platform }: { platform: Platform }) {
  return <span className="text-[11px]">{platform === "tiktok" ? "TT" : "IG"}</span>;
}

function parsePlatform(value: string | null): Platform {
  return value === "instagram" ? "instagram" : "tiktok";
}

function firstStatus(platform: Platform) {
  return platform === "tiktok"
    ? "Fetching your TikTok profile..."
    : "Fetching your Instagram profile...";
}

function analyzingStatus(platform: Platform) {
  return platform === "tiktok"
    ? "Analyzing 12 recent videos..."
    : "Analyzing 12 recent posts...";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0
  }).format(value);
}
