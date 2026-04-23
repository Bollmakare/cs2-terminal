# CS2 Terminal

A professional CS2 inventory and market analytics platform built with Next.js, Supabase, and multiple market data APIs.

## Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **APIs**: Skinstrack, CSFloat, PricEmpire, Steam
- **Deployment**: Vercel

## Setup
1. Copy `.env.local.example` to `.env.local` and fill in your API keys
2. Run the Supabase migrations in `supabase/migrations/` in order (001–007)
3. `npm install && npm run dev`
