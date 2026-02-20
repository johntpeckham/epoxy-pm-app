# Epoxy PM

A field project management web app for specialty epoxy contracting crews.

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Supabase** (Postgres database, Auth, Storage)
- **Tailwind CSS v4**
- **Vercel** (deployment target)

## Features (Phase 1)

- Email/password authentication via Supabase Auth
- Jobs list with project cards (name, client, address, status)
- Create new projects via modal form
- Per-project chat-style feed with chronological posts
- Three post types: Text, Photo (multi-upload), Daily Field Report
- Pin any post — pinned posts appear in a collapsible section at the top of the feed
- Mobile-friendly dark sidebar + white main area

## Setup

### 1. Supabase Project

1. Create a new project at [supabase.com](https://supabase.com)
2. In the SQL Editor, run the contents of `supabase/schema.sql`
3. Enable Email authentication under **Authentication → Providers**
4. Invite users under **Authentication → Users** (up to 10)

### 2. Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Both values are found in **Project Settings → API** in Supabase.

### 3. Local Development

```bash
npm install
npm run dev
```

### 4. Deploy to Vercel

1. Push to GitHub
2. Import the repo in Vercel
3. Add the environment variables in Vercel project settings
4. Deploy

## Database Schema

| Table | Key Columns |
|-------|------------|
| `projects` | id, name, client_name, address, status, created_at |
| `feed_posts` | id, project_id, user_id, post_type, content (JSONB), is_pinned, created_at |

Photos are stored in Supabase Storage under the `post-photos` bucket.
