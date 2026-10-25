# Preset inbox Worker: one-time setup

The site is static, so something has to receive the uploads. This Worker checks a zip and puts it in a private GitHub repo.
It is free for this size of traffic. Nothing is published by it.

1. **Make the private repo** `sunskiefer/preset-inbox` on GitHub (Private, add a README so it has a `main` branch).
2. **Make a token:** GitHub > Settings > Developer settings > Fine-grained tokens > only `preset-inbox`,
   permissions *Contents: Read and write* and *Issues: Read and write*. Copy it.
3. **Cloudflare:** make a free account at cloudflare.com, then in a terminal in this `worker/` folder:
   ```
   npm install
   npx wrangler login
   npx wrangler kv namespace create LIMITS      # paste the id it prints into wrangler.toml
   npx wrangler secret put GITHUB_TOKEN         # paste the token
   npx wrangler deploy                          # prints https://lcronx-presets.<you>.workers.dev
   ```
4. Put that address in `presets/config.js` (`export const WORKER_URL = "https://...";`) and push. Uploads are live.
5. Test with a zip named like `Test-My Pack.zip` that holds one `.xpl`; an issue should appear in `preset-inbox`.

Limits built in: 4 uploads per person per hour, exact duplicates refused, a hidden trap field for bots, only your site's
address may call it (`ALLOWED_ORIGINS` in `wrangler.toml`).
