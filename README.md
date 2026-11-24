# Miss Erika

Personal work-management app for Erika (assistant to Michael Watson at Reborn with Michael).

- Frontend: Next.js (App Router)
- Database and login: Supabase (row-level security, single user, sign-ups disabled)
- Hosting: Vercel
- AI (from Stage 2): Groq free plan, called only from server routes. The key lives in Vercel environment variables and is never sent to the browser.

No client data, keys or private scripts are stored in this repository.

## Run locally

    cp .env.example .env.local   # fill in the Supabase URL and publishable key
    npm install
    npm run dev
    npm test                     # date and recurring-task rules

## Stages

1. Foundation: login, dashboard, tasks, settings, saved links (this commit)
2. Telegram clients and Erika replies
3. Daily report
4. Instagram leads (Sales Bible)
5. KPIs and retention
6. Resources, backup and final testing
