# REQ-16 — Google OAuth Sign-In

**GitHub Issue**: #1
**Branch**: `feat/google-oauth`

## Problem

Only GitHub OAuth is available on the login page. Users without a GitHub account (recruiters, general users) cannot sign in.

## Solution

Add a "Login with Google" button alongside the existing GitHub button. Supabase already supports Google as an OAuth provider — no backend changes are required.

## Scope

- Enable Google provider in Supabase Dashboard (manual prerequisite)
- Add `signInWithGoogle()` to `AuthService`
- Add "Login with Google" button to `LoginComponent`
- GitHub OAuth login continues to work

## Deploy Ordering (Critical)

Supabase Dashboard configuration **must** complete before deploying the Angular code:

1. Google Cloud Console → OAuth 2.0 credentials → Authorized redirect URI: `https://qpyctfteewdflvvgyubt.supabase.co/auth/v1/callback`
2. Supabase Dashboard → Authentication → Providers → Google → enable + paste credentials
3. Supabase Dashboard → Authentication → URL Configuration → add `https://<vercel-url>/auth/callback`
4. Deploy Angular code to Vercel

## Acceptance Criteria

- Users with a Google account can sign up and sign in
- After login, they are routed to `/dashboard`
- GitHub OAuth login continues to work

## Out of Scope (follow-up issues)

- OAuth failure UX (no error message shown on redirect back to `/`)
- Email conflict behavior (GitHub email = Google email account linking)
