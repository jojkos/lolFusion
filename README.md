# LoL Fusion

Daily League of Legends Champion Fusion Puzzle Game.

## Setup

1. **Install Dependencies**:

   ```bash
   npm install
   ```

2. **Environment Variables**:
   Copy `.env.example` to `.env.local` and fill in the values:

   - `GEMINI_API_KEY`: Google Gemini API Key.
   - `BLOB_READ_WRITE_TOKEN`: Vercel Blob Token.
   - `KV_REST_API_URL` & `KV_REST_API_TOKEN`: Vercel KV Credentials.
   - `CRON_SECRET`: Random string for securing cron jobs.
   - `ADMIN_SECRET`: Secret for manual generation.

   > **Note on Vercel KV**: The environment variables `KV_REST_API_URL` and `KV_REST_API_TOKEN` are **implicitly required** by the `@vercel/kv` SDK. You do not need to import them manually in your code, but they MUST exist in `.env.local` for the library to connect to your database.

3. **How to get Vercel KV Credentials**:

   - Go to your Vercel Project Dashboard.
   - Click **Storage**.
   - If you see "Vercel KV" (or just "KV"), create it.
   - **Important**: If you don't see "KV" purely listed, look under **Marketplace Database Providers** and select **Upstash for Redis**. Vercel KV is powered by Upstash.
   - Once created, go to the **.env.local** tab in the database settings (or "Quickstart" section).
   - Copy `KV_REST_API_URL` and `KV_REST_API_TOKEN` into your local `.env.local` file.
   - Do the same for Vercel Blob (`BLOB_READ_WRITE_TOKEN`).

4. **Run Locally**:

   ```bash
   npm run dev
   ```

5. **Local E2E Testing**:
   Since the app relies on cloud services (Blob/KV/Cron), to test the full flow locally:
   1. Ensure your `.env.local` has valid production or development credentials for Vercel KV and Blob.
   2. Start the server: `npm run dev`.
   3. **Generate a Puzzle**: Manually trigger the cron route via your browser or curl:
      ```bash
      curl "http://localhost:3000/api/cron/generate?secret=YOUR_ADMIN_SECRET"
      ```
   4. **Play**: Go to `http://localhost:3000`. You should see the generated puzzle.
   5. **Note**: Locally, cron jobs don't run automatically; you must trigger the endpoint manually as shown above.

## Deployment

Deploy to Vercel:

1. Link project to Vercel.
2. Add Storage (Blob and KV).
3. Set Environment Variables in Vercel.
4. The Cron Job is automatically configured via `vercel.json` to run at midnight UTC.

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS
- Vercel KV & Blob
- Google Gemini API (Imaging)
