# The admin reads roles from `user_roles` on each request and accepts only Google sessions

The admin decides who may do what by reading the person's row in `user_roles` on every request, not from the `user_role` claim the Custom Access Token hook puts in the JWT (which #36 planned to use). A token lives up to an hour, so a role revoked or lowered on the People page (#45) would keep working until the token refreshed; reading the table makes a change take effect on the person's next request, at the cost of one small query per admin request. The claim stays in the token but nothing in the app trusts it.

Outside the local Supabase stack the admin accepts only sessions that signed in with Google (the JWT's `amr` says `oauth`); any other session is signed out and treated as signed out. Email sign-up has to stay on in the Supabase config because the e2e tests sign in with passwords, and with confirmations off anyone could create a password account under an invited person's email, which Supabase may later link to that person's Google identity and so hand them the invited role. Password sessions are therefore accepted only when Supabase is `localhost` or `127.0.0.1`, where e2e runs.

## Considered options

- **Trust the JWT claim and shorten the token lifetime**: rejected; revocation would still lag by the lifetime, and short tokens cost every player refreshes too.
- **Turn email sign-up off everywhere**: rejected for now; e2e needs a sign-in that doesn't go through Google. Disabling the Email provider in the production dashboard is recommended as defence in depth (README, Admin sign-in).
