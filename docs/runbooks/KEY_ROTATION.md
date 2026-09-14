# Key Rotation & History Scrub Runbook — VIARA

> **EXECUTION LOG (2026-09-13/14): COMPLETE for all hosted refs.**
> - Keys rotated via `backend/scripts/rotateKeys.js` (keyring `default` →
>   `rot-2026091316152`, 151/151 patients re-encrypted, blind indexes rebuilt,
>   e2e blind search verified, backend boots `READY`). DB superuser password
>   and `ORTHANC_PASSWORD` rotated with reconnect proof.
> - History scrubbed with `git filter-repo` (PHI uploads removed + 7 secret
>   patterns replaced; verified zero-occurrence) and force-pushed to
>   `origin/main` AND `origin/spectacled-foundation` (repo renamed
>   VIARA-RCMS). Remote re-verified clean by independent clone scan.
> - Branch protection (ruleset #21202766) was temporarily lifted via the REST
>   API for the push window and RESTORED to its exact original state
>   (deletion, non_fast_forward, pull_request — verified active).
> - PR #1 (closed) head ref now points at scrubbed history automatically.
> - Local `main` migrated to the scrubbed tip; uncommitted work preserved.
> **Optional hardening (owner discretion):**
> 1. Old commits are unreachable from every hosted ref but may persist
>    server-side until GitHub's garbage collection. Request early GC from
>    GitHub Support, or delete + recreate the repository for guaranteed
>    removal (repo is private, so exposure requires exact SHAs).
> 2. Four local kilo worktree branches (carnelian-name, important-minnow,
>    standing-stick, uneven-hippodraco) still reference pre-scrub history.
>    Migrate them (same update-ref + checkout procedure) once their agent
>    sessions finish, then `git gc --prune=now` in D:\RCMS.
> 3. Migration checksum note: `001_add_roles.sql` was scrubbed (shared bcrypt
>    hash removed). Any OTHER environment with it applied must refresh its
>    `schema_migrations.checksum` or startup migration gating will fail.

**Status:** REQUIRED BEFORE PRODUCTION. Code-side hardening is complete (no more
committed fallbacks); this runbook covers the operational steps that must run on
the deployment itself. The incident: `ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, a DB
credential, and demo passwords were committed in seeder files and pushed to
`origin/main` (GitHub, private). Three real patient files were tracked under
`backend/uploads/` and pushed.

## 1. What is already done (code side)

- `database/seed.js`, `backend/seed.js` — all secret fallbacks removed; seeders
  now fail fast with a clear error when env vars are missing.
- `database/seed.sql` — shared demo bcrypt hash replaced by disabled
  placeholder accounts (`is_active = FALSE`) that do not upsert over real users.
- `backend/uploads/` untracked from the index; `.gitignore` extended.
- `pacs/ai-worker` — unauthenticated `/health/live` added; compose healthcheck
  no longer embeds `PACS_AI_WORKER_API_KEY`.
- CI guard added (`.github/workflows/ci.yml`): fails if `backend/uploads/**` is
  ever tracked again or secret fallbacks reappear in seeders.

## 2. Key rotation (do on the deployment, in this order)

1. **Back up first.** Take a verified encrypted backup and copy the *current*
   `.env` aside (it contains the old keys needed for re-encryption).
2. **Generate new keys:**
   ```powershell
   # ENCRYPTION_KEY (64 hex chars)
   -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
   # BLIND_INDEX_KEY (base64, 32+ bytes)
   [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
   ```
3. **Update the keyring properly.** This project supports key rotation via
   `ENCRYPTION_KEYS` (keyring JSON with an active key) — see
   `backend/src/config/validateEnv.js` (ENCRYPTION_KEYS validation) and
   `backend/src/utils/crypto.js`. Add the new key as active, keep the old key
   in the ring for reads, then set `ENCRYPTION_KEY` to the new active key.
4. **Re-encrypt data with the new key:**
   ```powershell
   node backend/scripts/reencryptData.js
   ```
   Run against a snapshot/low-traffic window; verify row counts and spot-decrypt
   a few patient records before proceeding.
5. **Rebuild blind indexes.** The blind index HMACs must be recomputed with the
   new `BLIND_INDEX_KEY` so searches still match. If a rebuild script is not
   present, do it table-by-table: read plaintext via the decrypt util, re-hash
   with `hashBlind`, update `*_blind` columns inside one transaction per table.
6. **Rotate the exposed DB credential** (`rcms` user / any password that
   appeared in seeder fallbacks) and the Orthanc password:
   ```sql
   ALTER ROLE rcms WITH PASSWORD '<new-strong-password>';
   ```
   Update `.env` / compose env accordingly.
7. **Restart backend**, then verify: login works, patient search works (blind
   index OK), patient detail shows decrypted names (field crypto OK), backups
   still restore with `BACKUP_ENCRYPTION_KEY` (unchanged — rotate it too if
   policy requires).

## 3. Git history scrub (do in the MAIN repo, not this worktree)

`D:\VIARA` is a worktree of `D:\RCMS`. History rewrite must happen in `D:\RCMS`
with all worktrees removed (`git worktree remove` for each), then re-created.

```powershell
cd D:\RCMS
git worktree list   # remove each listed worktree first

# Option A — git filter-repo (recommended)
pip install git-filter-repo
git filter-repo --invert-paths --path backend/uploads --path database/seed.js --path backend/seed.js --force
# NOTE: filter-repo removes the files entirely from history. Since seed.js is
# still needed (now sanitized), re-add the sanitized versions afterwards.

# Option B — BFG (simpler, keeps files, strips only secret *strings*)
# Build replacements.txt LOCALLY from the key backups — never paste real key
# values into committed documentation or shell history:
#   node -e "const fs=require('fs');const e={};for(const l of fs.readFileSync('.env.backup-<stamp>','utf8').split(/\r?\n/)){const m=l.match(/^(ENCRYPTION_KEY|BLIND_INDEX_KEY)=(.+)$/);if(m)e[m[1]]=m[2]}fs.writeFileSync('replacements.txt',Object.values(e).map(v=>v+'>>>REMOVED').join('\n')+'\n')"
bfg --replace-text replacements.txt \
    --delete-folders uploads
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force-push ALL branches
git push origin --force --all
git push origin --force --tags
```

## 4. GitHub-side actions (cannot be done from the repo alone)

1. **Check repo visibility** (Settings → General → Danger Zone). If it was ever
   public, treat all PHI as disclosed and notify per your compliance policy.
2. **Review access**: Settings → Collaborators, Deploy keys, Personal access
   tokens, GitHub Apps. Revoke anything unused.
3. **Contact GitHub Support** to request garbage collection of old commits on
   their side (they retain unreachable objects for a period; a support request
   can trigger early GC), and to check for cached views/forks.
4. **Audit the repo's security log** (Settings → Audit log) for unexpected
   clones/fetches during the exposure window.

## 5. Acceptance criteria

- [ ] `git log --all -S '<old-key-prefix>'` returns nothing in `D:\RCMS`
- [ ] `git ls-files backend/uploads` empty; files exist only on disk
- [ ] Fresh `npm run db:migrate && node database/seed.js` fails loudly without
      env vars (no silent defaults)
- [ ] Backend boots, login + patient search + patient detail verified
- [ ] Old keys work only as decryption ring members; new key is active
- [ ] CI green on the rewritten `main`
