# Oracle Always Free Linux / PocketBase backend host (planned)

> Legacy deployment notes. The active backend direction is Cloudflare Workers, D1, and Durable Objects; do not use this PocketBase/Oracle guide for the current setup. See the Cloudflare backend setup in the root README.

This project requires a **separate, always-on backend host** because GitHub Pages only serves static files. Oracle's Always Free A1 VM is one possibility, but availability is not guaranteed; check your region and account charges before creating anything.

1. Create an Always Free eligible VM in Oracle Cloud. For A1, use **Linux ARM64** PocketBase; for AMD, use x64. Restrict inbound SSH to trusted IP addresses, and allow HTTP/HTTPS for TLS issuance and game traffic. Observe Oracle network security rules **and** the instance firewall.
2. Set a DNS `A` record for a hostname you control (e.g., `api.YOUR-DOMAIN.example`) pointing to the VM's public address. GitHub Pages over HTTPS requires a reachable HTTPS backend; do **not** use an HTTP-only IP endpoint for public play.
3. On the VM, install the official PocketBase Linux ARM64/x64 release that matches your VM architecture. Do not fetch unsigned binaries from unrelated repositories. Create a dedicated non-root account named `angrymarbles` and `/opt/angry-marbles`. Place `pocketbase`, the full `pb_hooks` and `pb_migrations` folders there, owned by that account. Create the PocketBase superuser using its documented CLI.
4. Copy `deploy/angry-marbles.service` to `/etc/systemd/system/`, then `sudo systemctl daemon-reload && sudo systemctl enable --now angry-marbles`. The service binds only to loopback port 8090.
5. Configure Caddy or NGINX as a reverse proxy on HTTPS using the sample Caddyfile (with your real hostname), and confirm HTTPS certificates are valid. **Do not expose 8090 directly to the public Internet**.
6. Open `https://api.YOUR-DOMAIN.example/_/` and configure PocketBase application settings, verification/recovery SMTP, rate limiting and backups. Change the default administrator password to a unique strong one.
7. In GitHub, set `VITE_POCKETBASE_URL` (repository Actions **variable**, not a secret) to the **HTTPS** address and push code to deploy the static app.
8. Create two player accounts on different devices. Validate signup, login, joining, same/opposite team, live updates, timers, private hands, bots, stats, and reconnection before opening public matches.

### Notes

- PocketBase's `pb_data/` contains your live database and must **never** be committed to GitHub. Schedule reliable off-machine backups (and test restores). The ZIP does **not** include credentials, a server executable, or VM provisioning.
- Only commit `pb_hooks/` and `pb_migrations/`. PocketBase automatic schema migrations may add files here as settings change; review them before publishing.
- See https://pocketbase.io/docs/going-to-production/ and https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm.
