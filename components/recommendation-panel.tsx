import type { Recommendation } from "@/lib/types";

type RecommendationPanelProps = {
  recommendation: Recommendation;
};

export function RecommendationPanel({
  recommendation
}: RecommendationPanelProps) {
  return (
    <article className="rounded-lg border border-ink/10 bg-white p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
        Recommended action
      </p>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">
            {recommendation.title}
          </h2>
          <p className="mt-3 text-base leading-7 text-ink/65">
            {recommendation.description}
          </p>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-ink/75">Why Otto thinks so</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-ink/65">
              {recommendation.reasoning.map((reason) => (
                <li key={reason}>- {reason}</li>
              ))}
            </ul>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-ink/75">
              Supporting metrics
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {recommendation.supportingMetrics.map((metric) => (
                <div
                  className="rounded-md border border-ink/10 p-3"
                  key={metric.label}
                >
                  <p className="text-xs font-medium text-ink/45">
                    {metric.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold">{metric.value}</p>
                  <p className="text-xs text-moss">{metric.trend}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-ink p-4 text-white">
          <p className="text-sm font-semibold text-white/60">Next step</p>
          <p className="mt-2 text-lg font-semibold">
            Prepare a {recommendation.actionType} action
          </p>
          <button className="mt-5 min-h-11 w-full rounded-md bg-signal px-4 text-sm font-semibold text-white transition hover:bg-signal/90">
            Generate outreach
          </button>
        </div>
      </div>
    </article>
  );
}
