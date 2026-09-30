# Account emails

Branded templates for the sign-up and password-reset emails that Supabase Auth
sends. They are not part of the site build; paste them into Supabase.

## Send from betthisguy.com (Resend)

1. Resend → Domains → add `betthisguy.com` and add the DNS records it lists in
   Cloudflare DNS (set them to "DNS only", not proxied). Wait for "Verified".
2. Resend → API Keys → create a key with "Sending access".
3. Supabase → Authentication → Emails → SMTP Settings → enable custom SMTP:
   - Sender email: `no-reply@betthisguy.com`
   - Sender name: `Bet This Guy`
   - Host: `smtp.resend.com`, Port: `465`
   - Username: `resend`, Password: the Resend API key

## Templates

Supabase → Authentication → Emails → Templates. For each one, set the subject
and paste the whole HTML file into the message body.

| Supabase template | Subject | File |
| --- | --- | --- |
| Confirm signup | Confirm your Bet This Guy account | `confirm-signup.html` |
| Reset password | Reset your Bet This Guy password | `reset-password.html` |

Both link to `https://betthisguy.com/?token_hash={{ .TokenHash }}&type=...`
instead of Supabase's `{{ .ConfirmationURL }}`. The site verifies the token
itself (`handleEmailLink` in `dist/auth.js`), so the link works in any browser
or mail app. The default link only works in the browser that asked for it.
The logo loads from `https://betthisguy.com/bet-this-guy-logo-v3.png`, so keep
that file in `dist/`.

After saving, test with a real address: sign up once, and use "Forgot
password" once.
