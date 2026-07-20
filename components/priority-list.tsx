import type { Priority } from "@/lib/types";

type PriorityListProps = {
  priorities: Priority[];
};

export function PriorityList({ priorities }: PriorityListProps) {
  return (
    <div className="mt-6 grid gap-3 md:grid-cols-3">
      {priorities.map((priority) => (
        <article
          className="rounded-lg border border-ink/10 bg-paper p-4"
          key={priority.title}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-signal">
              {priority.agentSource}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink/60">
              {priority.urgency}
            </span>
          </div>
          <h3 className="mt-4 text-lg font-semibold tracking-tight">
            {priority.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            {priority.summary}
          </p>
        </article>
      ))}
    </div>
  );
}
