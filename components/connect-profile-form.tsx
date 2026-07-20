"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { Platform } from "@/lib/types";

const platforms: Array<{
  id: Platform;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
  placeholder: string;
}> = [
  {
    id: "tiktok",
    label: "TikTok",
    icon: TikTokIcon,
    placeholder: "@_offo"
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: InstagramIcon,
    placeholder: "@_offo98"
  }
];

export function ConnectProfileForm() {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [handle, setHandle] = useState("");
  const selectedPlatform = platforms.find((item) => item.id === platform) ?? platforms[0];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedHandle = handle.trim().replace(/^@/, "");

    if (!normalizedHandle) {
      return;
    }

    const params = new URLSearchParams({
      platform,
      handle: normalizedHandle
    });

    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <form
      className="landing-rise rounded-lg border border-ink/10 bg-white/82 p-4 shadow-[0_24px_70px_rgba(17,17,17,0.08)] backdrop-blur sm:p-5"
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-2 gap-2 rounded-md bg-ink/[0.04] p-1">
        {platforms.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === platform;

          return (
            <button
              aria-pressed={isActive}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-[6px] px-3 text-sm font-semibold transition ${
                isActive
                  ? "bg-white text-ink shadow-sm"
                  : "text-ink/55 hover:text-ink"
              }`}
              key={item.id}
              onClick={() => setPlatform(item.id)}
              type="button"
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      <label className="mt-5 block text-sm font-medium text-ink/60" htmlFor="handle">
        Creator handle
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          autoComplete="off"
          className="min-h-12 flex-1 rounded-md border border-ink/15 bg-white px-4 text-base outline-none transition placeholder:text-ink/32 focus:border-signal"
          id="handle"
          name="handle"
          onChange={(event) => setHandle(event.target.value)}
          placeholder={selectedPlatform.placeholder}
          type="text"
          value={handle}
        />
        <button
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-ink px-5 text-sm font-semibold text-white transition hover:bg-ink/86 disabled:cursor-not-allowed disabled:bg-ink/35"
          disabled={!handle.trim()}
          type="submit"
        >
          Connect account
        </button>
      </div>
    </form>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14.7 4v9.4a4.1 4.1 0 1 1-3.9-4.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M14.7 4c.4 2.5 2 4.2 4.6 4.7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        height="15"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
        width="15"
        x="4.5"
        y="4.5"
      />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="16.7" cy="7.3" fill="currentColor" r="0.9" />
    </svg>
  );
}
