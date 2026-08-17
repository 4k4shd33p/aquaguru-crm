# Aquaguru CRM

The V1 frontend foundation is a React and Vite application with Supabase email/password authentication, protected routes, and a responsive CRM shell.

## Local setup

1. Copy `.env.example` to `.env`.
2. Configure the following browser-safe Supabase values:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
3. Run `npm install` and `npm run dev`.

The application deliberately contains no business-module queries or mock records. All future data access must use the central client in `src/lib/supabase.js` and remain constrained by Supabase RLS.
