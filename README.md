# openai_build_AI_COS
AI Chief of Staff for influencers+

## Launch the UI locally

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

Try the demo handle `_offo` for TikTok or `_offo98` for Instagram.
