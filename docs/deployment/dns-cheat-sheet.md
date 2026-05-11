# DNS Records Cheat Sheet

> Every DNS record needed at the registrar, in one place. Replace `khaliqoil.com` with your actual domain.
> Real values for the **Value** column come from the dashboard noted in the **Source** column — do not invent them.

## Vercel — app + www

| Type | Host / Name | Value (placeholder — get real value from Source) | TTL | Source |
|---|---|---|---|---|
| `A` | `@` (apex root) | `76.76.21.21` (Vercel's anycast IP) | `Auto` / `3600` | Vercel → Project → Settings → Domains → Add `khaliqoil.com` |
| `CNAME` | `www` | `cname.vercel-dns.com` | `Auto` / `3600` | Vercel → same panel; Vercel auto-creates the redirect from www → apex |

**Notes:**
- The Vercel A record value (`76.76.21.21`) is a stable anycast IP that has not changed in years. Confirm it in the Vercel dashboard before applying — they're the source of truth.
- If you prefer a subdomain (e.g. `app.khaliqoil.com`), use a single `CNAME` for `app` → `cname.vercel-dns.com` and skip the apex `A` record entirely.
- **Cloudflare users:** if your registrar is Cloudflare, set proxy status to **DNS only** (grey cloud) for both rows above. Vercel handles SSL itself; Cloudflare proxying confuses the cert exchange.

## Resend — email sending (SPF + DKIM + return-path)

Resend's dashboard generates these for your specific domain. The placeholders below show the shape; **the real values include your domain hash (`<resend-id>`)**.

| Type | Host / Name | Value (placeholder) | TTL | Source |
|---|---|---|---|---|
| `TXT` | `send` | `v=spf1 include:amazonses.com ~all` | `Auto` / `3600` | Resend → Domains → click `khaliqoil.com` → "DNS records" |
| `MX` | `send` | `feedback-smtp.us-east-1.amazonses.com` (priority `10`) | `Auto` / `3600` | Same panel — sets the return-path for bounces |
| `TXT` | `resend._domainkey` | `p=MIIBIjAN…` (full RSA public key, ~250 chars) | `Auto` / `3600` | Same panel — DKIM signature key |

**Notes:**
- Resend uses a single DKIM record (not 3) as of 2026 — older docs say 3, but the dashboard is authoritative. Add exactly what it shows.
- If your registrar truncates long TXT values, split into two strings: `"part1" "part2"` (most modern UIs do this for you).
- Verification typically completes within 10–30 minutes after records propagate. Use `dig TXT resend._domainkey.khaliqoil.com` to confirm.

## DMARC — recommended for deliverability

Not strictly required by Resend, but Gmail/Outlook now penalize senders without DMARC. Add this once SPF + DKIM are green.

| Type | Host / Name | Value | TTL | Source |
|---|---|---|---|---|
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@khaliqoil.com; pct=100; aspf=r; adkim=r;` | `Auto` / `3600` | Hand-rolled — start with `p=none` (monitor only), tighten to `p=quarantine` then `p=reject` after 30 days of clean reports |

**Notes:**
- Replace `dmarc@khaliqoil.com` with a real inbox you'll check. Or use a service like postmarkapp.com (free DMARC weekly digest).
- Do NOT skip the trailing `;` — some parsers strict-fail without it.

## Optional — MX for receiving email at the domain

Only needed if you want `owner@khaliqoil.com` to actually receive mail (vs. just send). Skip if you already use Gmail/Workspace/Office365 separately.

| Type | Host / Name | Value | Priority | TTL | Source |
|---|---|---|---|---|---|
| `MX` | `@` | `aspmx.l.google.com` (Google Workspace) | `1` | `Auto` | Workspace admin → Setup → Activate Gmail |
| `MX` | `@` | `alt1.aspmx.l.google.com` | `5` | `Auto` | Same |
| `MX` | `@` | `alt2.aspmx.l.google.com` | `5` | `Auto` | Same |
| `MX` | `@` | `alt3.aspmx.l.google.com` | `10` | `Auto` | Same |
| `MX` | `@` | `alt4.aspmx.l.google.com` | `10` | `Auto` | Same |
| `TXT` | `@` | `v=spf1 include:_spf.google.com ~all` | — | `Auto` | Workspace setup |

**Important:** if you also use Resend, your apex `@` SPF record needs to include both: `v=spf1 include:_spf.google.com include:amazonses.com ~all`. You can only have **one** SPF TXT record at the apex — multiple SPF records will silently break delivery.

## CAA — certificate authority authorization (recommended)

Restricts which CAs can issue certs for your domain. Vercel uses Let's Encrypt.

| Type | Host / Name | Value | TTL | Source |
|---|---|---|---|---|
| `CAA` | `@` | `0 issue "letsencrypt.org"` | `Auto` | Hand-rolled |
| `CAA` | `@` | `0 issuewild "letsencrypt.org"` | `Auto` | Hand-rolled (allows wildcard certs) |

**Notes:** if you set CAA records before adding the Vercel domain, the SSL provisioning will succeed cleanly. If CAA is wrong, the cert request silently fails and you'll see a 526/525 SSL error in browsers.

---

## Apply order (recommended)

1. **First**: Vercel A + CNAME (Section: Vercel) — get the site live
2. **Then**: CAA records — before SSL retries
3. **Then**: Resend SPF + MX + DKIM — once sending email
4. **Then**: DMARC — after SPF + DKIM verify in Resend
5. **Optional**: Workspace MX records — if you want incoming email

After all records are added, run from any machine:

```bash
dig +short app.khaliqoil.com           # expect Vercel IP
dig +short TXT send.khaliqoil.com      # expect SPF
dig +short TXT resend._domainkey.khaliqoil.com   # expect DKIM
dig +short TXT _dmarc.khaliqoil.com    # expect DMARC
dig +short CAA khaliqoil.com           # expect both letsencrypt rows
```

If a record returns empty, propagation is incomplete (wait up to 30 min) or the record was entered with a typo (most often: extra trailing dot, or wrapping quotes copy-pasted from the dashboard).
