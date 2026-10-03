# Domain router Worker

Routes customer custom domains (Cloudflare for SaaS) to the app origin with a signed
hostname header. See `src/index.ts` for the protocol and `src/lib/tenant/edge-signature.ts`
for the verifier.

## Deploy

1. In the platform zone, enable **Cloudflare for SaaS**, set the fallback origin, and
   create the CNAME target stored in the app's `CUSTOM_DOMAIN_CNAME_TARGET`.
2. `wrangler secret put EDGE_SHARED_SECRET` — the same 32+ char value as the app env.
3. Set `ORIGIN_URL` in `wrangler.toml` to the app's origin hostname (not a customer domain).
4. Uncomment and adjust `routes`, then `npx wrangler deploy`.

Custom hostnames are created and verified by the app (`src/features/domains`) via the
Cloudflare API; this Worker never looks tenants up and holds no data.

## Security

- Client-supplied `x-paliya-*` headers are stripped before forwarding.
- Signatures are valid for 5 minutes; the app rejects stale or unsigned headers and then
  falls back to the literal `Host`.
- Redirects pointing at the origin host are rewritten to the customer host.
