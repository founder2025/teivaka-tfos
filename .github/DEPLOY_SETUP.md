# Auto-deploy setup (one time)

`.github/workflows/deploy.yml` SSHes into the droplet and runs the existing
`/opt/teivaka/deploy.sh`. It reinvents nothing — every prod-safety guard stays:
`--no-cache` API build (B78), migrate-as-owner (Strike #123), `verify-deploy.sh`,
`EXPECTED_HEAD` assert, Caddy `--force-recreate`. The pipeline just *runs* it.

## Trigger model
- **Push** to `claude/beautiful-fermi-F0dLX` → deploys **only if** repo variable
  `AUTO_DEPLOY == "true"`. Pure-docs pushes (`**.md`, `docs/**`) are skipped.
- **Manual** "Run workflow" button (Actions tab) → always deploys, even with
  `AUTO_DEPLOY` off. Use this until you trust the auto path.
- Two deploys never overlap (concurrency group `deploy-prod`, queue-don't-cancel).

## 1. GitHub Secrets  (repo → Settings → Secrets and variables → Actions → Secrets)
| Secret | Value | Notes |
|---|---|---|
| `DROPLET_HOST` | `168.144.36.120` | droplet IP |
| `DROPLET_USER` | the deploy SSH user | see §3 — a user allowed to run `deploy.sh` |
| `DROPLET_SSH_KEY` | the **private** half of the dedicated deploy key | paste the file contents into the secret box — never into chat/commits |
| `DROPLET_PORT` | `22` | only if SSH is on a non-default port |
| `DROPLET_FINGERPRINT` | output of `ssh-keyscan` (optional) | pins the host key; prevents MITM |

## 2. Repo variable  (same page → **Variables** tab, not Secrets)
| Variable | Value |
|---|---|
| `AUTO_DEPLOY` | `true` to enable push-deploys · anything else / delete = paused |

## 3. One-time droplet setup — dedicated, forced-command deploy key
Run these **on the droplet** as the deploy user. A dedicated key that can ONLY run
`deploy.sh` means a leaked GitHub secret can't get a shell — it can only deploy.

```bash
# a) generate a deploy-only keypair (no passphrase; on the droplet, not in chat)
ssh-keygen -t ed25519 -f ~/.ssh/gha_deploy -N "" -C "gha-deploy"

# b) authorize it, LOCKED to the deploy command (forced command = no shell)
mkdir -p ~/.ssh && chmod 700 ~/.ssh
printf 'command="cd /opt/teivaka && bash deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty %s\n' \
  "$(cat ~/.ssh/gha_deploy.pub)" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# c) print the PRIVATE key — copy it straight into the DROPLET_SSH_KEY GitHub secret
cat ~/.ssh/gha_deploy

# d) (optional) host fingerprint for the DROPLET_FINGERPRINT secret
ssh-keyscan -t ed25519 168.144.36.120 2>/dev/null

# e) after the key is saved in GitHub, delete the private half from the droplet
shred -u ~/.ssh/gha_deploy   # keep gha_deploy.pub; it's already in authorized_keys
```

**B67 caveat:** the `tfos` user has no authorized key today (only `root` does). Either
add this deploy key to `root` (works immediately, but the forced command is the guard),
or first give `tfos` key access + docker + rights to run `deploy.sh`, then use `tfos`.
Whichever user you pick is the `DROPLET_USER` secret. The forced command is what keeps
`root` safe here — that key can run nothing but the deploy.

## 4. Trigger & verify
- **Manual:** Actions → "Deploy to prod droplet" → Run workflow → branch → Run.
- **Auto:** push code (with `AUTO_DEPLOY=true`).
- Watch the live log in the Actions tab. `script_stop: true` fails the job the
  instant `deploy.sh` errors, so a red run = a real failure.
- Confirm the head landed: the deploy log ends with the `EXPECTED_HEAD` assert;
  cross-check on the droplet with `docker exec teivaka_api alembic current`.

## 5. Rollback & pause
- **Pause auto-deploy:** set `AUTO_DEPLOY` ≠ `true` (or delete it). Manual button
  still works.
- **Rollback a bad deploy:** `deploy.sh` is safe to re-run. On the droplet:
  `cd /opt/teivaka && git reset --hard <last-good-sha> && bash deploy.sh` — rebuilds
  the API from the good SHA and re-asserts the head. (Migrations are additive/reversible;
  only `alembic downgrade` if a migration itself is the problem.)
- **Revoke the pipeline entirely:** remove the deploy line from `~/.ssh/authorized_keys`
  on the droplet — the key stops working instantly.
