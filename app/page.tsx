import { ConnectProfileForm } from "@/components/connect-profile-form";

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-paper px-6 py-7 text-ink sm:px-10">
      <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-6xl flex-col justify-between">
        <nav className="landing-rise flex items-center justify-between">
          <span className="text-xl font-semibold tracking-tight">Otto</span>
          <a
            className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium transition hover:border-ink/40"
            href="/dashboard?platform=tiktok&handle=_offo"
          >
            View demo
          </a>
        </nav>

        <div className="grid gap-12 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div className="landing-rise max-w-3xl">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-signal">
              Otto
            </p>
            <h1 className="text-5xl font-semibold leading-[0.95] tracking-tight sm:text-7xl">
              Your AI Chief of Staff for your creator business
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-ink/68">
              Connect a public profile and Otto turns recent content, audience
              signals, and sponsorship context into the next move.
            </p>
          </div>

          <ConnectProfileForm />
        </div>

        <div className="landing-rise flex flex-wrap items-center gap-x-6 gap-y-2 pb-2 text-sm text-ink/45">
          <span>Live public data</span>
          <span>TikTok first</span>
          <span>Instagram ready</span>
        </div>
      </section>
    </main>
  );
}
