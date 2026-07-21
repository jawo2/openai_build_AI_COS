# Otto | AI Chief of Staff for Creators

Otto helps creators turn social performance data into concrete next actions: growth priorities, brand outreach, content plans, and pricing guidance.

The current demo supports TikTok and Instagram creator analysis using Apify for scraping and OpenAI for structured agent reasoning.

## What This Project Does

- Scrapes or loads creator profile data for TikTok and Instagram.
- Normalizes recent posts/videos into a shared creator profile format.
- Runs specialized AI agents for content, growth, and business analysis.
- Produces a ranked creator brief with priorities, insights, and recommendations.
- Provides interactive workspaces for:
  - Dashboard priorities
  - Brand pipeline and outreach email drafting
  - Content studio planning
  - Pricing/rate-card guidance

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Add your local secrets to `.env.local`:

   ```env
   OPENAI_API_KEY=your_openai_key
   APIFY_API_TOKEN=your_apify_token
   DEMO_PASSWORD=choose_a_demo_password
   ```

   `.env.local` is ignored by git. Do not commit real API keys.

4. Start the dev server:

   ```bash
   npm run dev
   ```

5. Open the app:

   ```text
   http://localhost:3000
   ```

Try `_offo` for TikTok or `_offo98` for Instagram.

## API Keys And Demo Data

This repo does not include API keys. That is intentional.

To run live scraping and live AI analysis, each developer needs their own:

- `OPENAI_API_KEY`
- `APIFY_API_TOKEN`

Without keys, the app can still run locally using fallback demo/mock data, but live scraping and AI-generated responses will not work. The app is designed to fall back in this order:

1. Fresh cache, if available
2. Live Apify scrape, if credentials are configured
3. Older cache, if scraping fails
4. Mock demo data from `lib/mockData.ts`

For a public demo, deploy the app yourself and set API keys as server-side environment variables in the hosting provider, for example Vercel Environment Variables. Do not put real keys in GitHub.

## Useful Commands

Run the app locally:

```bash
npm run dev
```

Typecheck:

```bash
npm run typecheck
```

Lint:

```bash
npm run lint
```

Build:

```bash
npm run build
```

Run the agent manager test script:

```bash
npm run test:manager
```

## Data Notes

Live TikTok and Instagram data is fetched through Apify actors when `APIFY_API_TOKEN` is configured.

Normalized creator data includes:

- Platform and handle
- Follower count
- Engagement rate and trend
- Recent posts/videos
- Sponsored-content detection
- Breakout-video detection
- Whether metrics are estimated

TikTok view metrics are treated as public real data. Instagram reach/views are not generally available from public scraping, so Instagram performance metrics are marked as estimated where appropriate.

## OpenAI Usage

The app uses OpenAI structured outputs for predictable agent responses.

OpenAI is used for:

- Content agent: identifies repeatable content patterns and suggests next content moves.
- Growth agent: evaluates audience and performance trends.
- Business agent: turns creator metrics into brand and pricing recommendations.
- Manager agent: synthesizes the specialist outputs into a ranked action plan.
- Email generation: drafts outreach emails using only the recommendation's supporting metrics.
- Interactive workspace chat: refines brand outreach, content plans, and pricing guidance.

Schemas are defined with Zod in `lib/types.ts` and exported to JSON Schema for structured outputs.

## How Codex Accelerated The Workflow

Codex was used as a pair-programming agent throughout the build.

It accelerated the workflow by:

- Scaffolding the Next.js App Router project structure quickly.
- Creating shared Zod schemas and TypeScript types for the data model.
- Implementing Apify scraping, normalization, caching, and mock-data fallback logic.
- Building multi-agent OpenAI workflows with structured outputs.
- Adding API routes for analysis, email generation, brand chat, content chat, and pricing chat.
- Iterating on the UI from rough requirements and Figma screenshots into a working multi-tab product.
- Running local validation after changes with typecheck, lint, build, route checks, and dev-server restarts.

Key product decisions made during the process:

- Keep secrets out of GitHub and use `.env.local` for local credentials.
- Make the demo usable without live credentials through cache/mock fallback.
- Favor structured outputs over free-form AI text for stable product behavior.
- Present Otto as a proactive workspace instead of a passive analytics dashboard.
- Use separate tabs for the main creator workflows: Dashboard, Brand Pipeline, Content Studio, and Pricing.

