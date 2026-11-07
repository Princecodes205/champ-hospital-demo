# Git
- .env, .env.*, and supabase/.env are strictly ignored.
- No service role keys or secrets in commit messages or code.

# Project Environment
- Node.js 18+
- Supabase CLI
- Vite + React + TypeScript

# Dependencies
- TanStack Query (data fetching)
- Supabase (Auth, DB, Edge Functions)
- Zod (validation)
- Tailwind CSS (styling)
- Lucide React (icons)
- Vite PWA (service worker)
- React Router (routing)

# Core Architecture
- Feature-based structure: `src/features/{feature_name}`.
- UI components in `src/components/ui`.
- Layout components in `src/components/layout`.
- Shared logic in `src/lib`.
- No raw Supabase calls in components; use typed hooks.

# Brand Guidelines
- Primary Color: #5500FF.
- Font: Inter (Self-hosted).
- Style: Clinical, professional, minimal. No gradients, no glows, no "AI-generated" aesthetics.
- Radius: max 6px for controls, 8px for cards.

# Security
- RLS enabled on all tables.
- Role-based access control (RBAC) enforced at the database level.
- Service role key restricted to Edge Functions and local seed scripts.
- Identical error messages for all auth failures.
