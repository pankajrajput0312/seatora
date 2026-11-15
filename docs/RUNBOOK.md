# Runbook

How to keep Seatora's data current and the live site safe. This covers four jobs: adding a new MCC round (1), restoring from a backup (2), rotating the access secret or changing the allowed email (3), and what each check means (4).

The data is built in **neetpg-planner** from MCC's official PDFs. Seatora (this repo) only imports what the planner exports. Production runs on Supabase (Postgres) and Vercel at https://www.seatora.co.in.

**Rules that always apply**
- Back up first: Supabase before any migration or import, and `tools/backup_all.sh` before any planner rebuild.
- Credentials stay in files. Load them with `set -a; . <file>; set +a`. Never paste a URL, secret or password into a command, a chat or a doc.
- Resident names exist only in `neetpg-planner/data/medpath-private/`, Supabase and the backups. They never go into the public bundle (`data/medpath*/`), logs, screenshots or git.
- Deploy only from a `git archive` snapshot of a commit. Never deploy a working tree: it can hold another thread's half-finished edits and `.env` files.
- Imports run in one transaction and roll back on any failed check. A failed import changes nothing.

## 0. Setup

```sh
PLANNER=~/Documents/code/neetpg-planner
SEATORA=~/Documents/code/neet-pg-counselling-integrate      # branch integrate-real-data, the live code
MODULES=~/Documents/code/neet-pg-counselling/node_modules   # shared by every tree: never npm install in a worktree or copy
PG=/opt/homebrew/opt/postgresql@18/bin                       # psql, createdb, dropdb
```

Credential files (owner-only, `0600`):

| File | Holds |
|---|---|
| `~/.config/seatora/supabase.env` | `DATABASE_URL` (Supabase transaction pooler, port 6543, used by the app) and `DIRECT_URL` (port 5432, used for migrations, imports, backups and psql) |
| `~/.config/seatora/vercel.env` | A local copy of the Vercel production env (`DATABASE_URL`, `SITE_ACCESS_SECRET`, `SEATORA_ALLOWED_EMAILS`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`). Keep it in sync when you change Vercel. |
| `~/.config/seatora/db.env` | The local Postgres 18 `DATABASE_URL` (role `seatora`), for rehearsals |
| `~/.config/seatora/vercel-ids.env` | `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, so the CLI deploys to the Seatora project. **Create it once** (`0600`) from the last deploy snapshot's `.vercel-ids`, or from the Vercel dashboard (team Settings → Team ID; project Settings → General → Project ID). |

Some things live only in `/tmp` and disappear when it is cleared:
- **PDF venv** (needed by the parsers and `export_notices.py`):
  `python3 -m venv /tmp/pdfvenv && /tmp/pdfvenv/bin/pip install pypdf pdfplumber cryptography`
- **`/tmp/dump_one.py`** (the second, independent PDF text extraction that `verify_her_pdf.py` reads). Recreate it if it is gone:
  ```sh
  cat > /tmp/dump_one.py <<'EOF'
  # Independent second extraction of one MCC result PDF (pypdf text, not pdfplumber tables) for cross-checking.
  import os, sys
  import pypdf
  path, src, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
  out = os.path.join(outdir, os.path.relpath(path, src).replace('/', '__') + '.txt')
  if not os.path.exists(out):
      r = pypdf.PdfReader(path)
      with open(out + '.part', 'w') as f:
          for i, p in enumerate(r.pages):
              f.write(f'\n=====PAGE {i + 1}=====\n')
              f.write(p.extract_text() or '')
      os.rename(out + '.part', out)
  print('done', os.path.basename(out), flush=True)
  EOF
  ```
- **`/tmp/fees-r3/merge/scripts/build_terms.py`** rebuilds `data/curated/terms_structured.json`. You only need it after a college merge (see the note in `tools/export_medpath.py`'s docstring). Copy it into the planner's `tools/` before `/tmp` is cleared.

The Vercel CLI runs through npx (`npx --yes vercel@latest …`). `npx --yes vercel@latest whoami` shows the signed-in account. If it shows none, run `npx --yes vercel@latest login`.

## 1. Add a new MCC round

MCC posts each step on https://mcc.nic.in/pg-medical-counselling/ (Current Events). In order, a round brings: seat lists (clear vacancy, virtual vacancy, newly added seats), notices and schedule changes, the provisional result, the final result, and sometimes an admitted-candidates list. Run the whole pipeline once for each new PDF, or once for a batch of them.

### 1.1 Register the PDF

Add one line per PDF to `$PLANNER/data/official_sources.json`. It is a flat `"key": "url"` object. The URL is the PDF link from the MCC page and must be `https://`. The key decides how the PDF is parsed:

| MCC publishes | Key (2026 shown) | Parsed by |
|---|---|---|
| Round result, provisional | `mcc/2026/R2_provisional.pdf` | `parse_official.py` |
| Round result, final | `mcc/2026/R2_final.pdf` | `parse_official.py` |
| Stray / special stray result | `mcc/2026/stray_final.pdf`, `mcc/2026/special_stray_final.pdf` (or `_provisional`) | `parse_official.py` |
| Clear / virtual vacancy list | `mcc/2026/R3_clear_vacancy.pdf`, `mcc/2026/R3_virtual_vacancy.pdf` | `parse_seats.py` |
| Newly added seats | `mcc/2026/R3_new_seats.pdf`; a second list in the same round: `mcc/2026/R3_new_seats_2026-12-05.pdf` | `parse_seats.py` |
| Admitted candidates list | `mcc/2026/admitted_upto_R1.pdf` (must start with `admitted`) | `parse_official.py`, then `export_residents.py` |
| NBEMS merit list / published result | `nbems/<year>/merit_list_AIQ50.pdf`, `nbems/<year>/published_result.pdf` | `parse_official.py` / `parse_merit_extra.py` |
| Notice, bulletin, schedule | must contain `notice` or `bulletin` | not parsed |

Naming rules:
- Round prefixes are `R1`, `R2`, `R3`, `stray` and `special_stray`. A result is final only if `final` is in its name.
- Any other PDF under `mcc/<year>/` must have `vacancy`, `new_seats`, `bulletin` or `notice` in its name. Otherwise `parse_official.py` reads it as an allotment result.
- `parse_seats.py` reads only `R*.pdf`, so seat lists for the stray rounds need a parser change first.

### 1.2 Planner: rebuild and check

```sh
cd "$PLANNER"
tools/backup_all.sh                                        # planner data/, the local DB, uncommitted code in both repos
tools/fetch_official.sh                                    # downloads new keys only; "FAIL … not a PDF" = the link moved

/tmp/pdfvenv/bin/python -I tools/parse_official.py         # results, admitted lists, AIQ merit lists (new files only)
/tmp/pdfvenv/bin/python -I tools/parse_seats.py            # every seat list (reloads all of them each run)
/tmp/pdfvenv/bin/python -I tools/parse_merit_extra.py      # only when NBEMS publishes a new result PDF
python3 -I tools/build_db.py

# independent cross-check of her courses against a second extraction of each new RESULT PDF
python3 -I tools/export_her.py
/tmp/pdfvenv/bin/python -I /tmp/dump_one.py data/official/mcc/2026/R2_provisional.pdf data/official data/build/pdftext
python3 -I tools/verify_her_pdf.py                         # exit 0, no disagreements

# exports, in this order (export_medpath checks and copies the files the first two write)
/tmp/pdfvenv/bin/python -I tools/export_notices.py         # reads MCC's PG pages (network): notices + round status
python3 -I tools/export_merit_stats.py
python3 -I tools/export_medpath.py                         # data/medpath
python3 -I tools/export_medpath.py --out data/medpath-r3   # the bundle Seatora imports
python3 -I tools/export_residents.py                       # private names bundle, data/medpath-private

python3 -I tools/check_db.py                               # with data/medpath; last line "N passed, 0 failed"
python3 -I tools/check_db.py --bundle data/medpath-r3      # and with the imported bundle
tools/backup_all.sh
```

- Always run `export_residents.py`. It is quick. You must run it when a new admitted list arrives or when a build changed a college key. Before running it for a new list, add the list to `LIST_ORDER` and `LIST_LABEL` at the top of `tools/export_residents.py` (later lists win within a year). Ranks only join for 2025 (the Seatora importer refuses other years' ranks), so a new year's residents show no rank.
- If a build retires a published college key (a `same_college` merge or a `separate_as` label in `data/institute_aliases.json`), add `old -> new` to `data/retired_keys.json`. `export_medpath.py` refuses to export otherwise. Judge every merge on evidence: precision over recall.
- `export_notices.py` keeps a few facts read by hand from notice PDFs (`SCHEDULED`, `SUSPENDED_UNTIL` near the top). When MCC publishes a new or modified schedule, add its dates there. Otherwise Schedule shows the step without dates.
- To re-parse a PDF MCC replaced under the same name: delete its cache `data/build/rows/<key with / as __>.jsonl` and its rows in `data/build/neetpg.db` (`DELETE FROM allotment WHERE src = '<key>'`, or `admitted`/`merit`), then rerun.

### 1.3 Seatora: back up, migrate, deploy, import

Order: **back up → migrate (+ lockdown) → deploy → import.** Code older than the schema shows "Data unavailable". Code older than a bundle that retires college keys breaks old college links. A data-only round (no new migration, no code change) needs only steps a and e.

```sh
set -a; . ~/.config/seatora/supabase.env; set +a           # DATABASE_URL + DIRECT_URL; never echo them

# a. back up Supabase: every table, verified against live counts
DATABASE_URL="$DIRECT_URL" node "$PLANNER/tools/backup_medpath_db.mjs" "$SEATORA" ~/Backups/neetpg/supabase-$(date +%Y%m%d-%H%M%S)
```
It must end with `verified <dir>`. The table counts it prints must look like production (Resident about 78,000, Allotment about 210,000). An empty or local-looking count means the wrong database: stop. The exported `DATABASE_URL` overrides the repo's `.env` (rehearsed 15 Nov).

```sh
# b. snapshot of exactly the commit to ship
git -C "$SEATORA" status --short                           # uncommitted work is NOT in the snapshot: commit what should ship
C=$(git -C "$SEATORA" rev-parse --short HEAD); D=/tmp/seatora-deploy-$C
rm -rf "$D" && mkdir -p "$D" && git -C "$SEATORA" archive "$C" | tar -x -C "$D"
ln -s "$MODULES" "$D/node_modules"                         # for prisma and the importers; .vercelignore keeps it out of the upload

# c. migrate: only when the commit adds migrations (status lists pending ones)
cd "$D" && DATABASE_URL="$DIRECT_URL" npx prisma migrate status
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
"$PG/psql" "$DIRECT_URL" -v ON_ERROR_STOP=1 -f "$PLANNER/tools/sql/supabase_lockdown.sql"   # after EVERY migrate deploy

# d. deploy: only when the code changed
cd "$D" && set -a && . ~/.config/seatora/vercel-ids.env && set +a
npx --yes vercel@latest deploy --prod --yes                # builds on Vercel with the project's production env

# e. import: always from the same snapshot, MCC data first, then names
cd "$D" && DATABASE_URL="$DIRECT_URL" npm run db:import -- "$PLANNER/data/medpath-r3"
DATABASE_URL="$DIRECT_URL" npm run db:import-residents -- "$PLANNER/data/medpath-private"
rm -rf "$D"
```
- `db:import` must end with `Committed. Spot checks passed (…)`. `db:import-residents` must end with `2 spot checks passed` and `rejected: 0`. Locally each takes under a minute. Supabase is slower, and the transaction allows 30 minutes.
- The importers use the Prisma client in the shared `node_modules`. If the import fails on an unknown model or field, the client is older than the schema. `npx prisma generate` in the snapshot fixes it, and it rewrites the client for every tree that shares those modules.

### 1.4 Verify the live site

```sh
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://www.seatora.co.in/decide   # 307 → /login?next=%2Fdecide
curl -s -o /dev/null -w '%{http_code}\n' https://www.seatora.co.in/api/v1/meta              # 401
for p in / /pricing /about /contact /terms /privacy /refund-policy /shipping-policy /login; do
  printf '%s ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://www.seatora.co.in$p"; done   # all 200
```
Then sign in and check four screens with her profile (rank 42,284, OBC, her five courses):
- Overview: the round status shows the new step.
- Counselling → Schedule: the new notice is listed.
- Options: once a result is imported, a new result opens the "every option" view. New seat lists open the round view, with the new round's seat columns.
- One college page (for example Kokilaben Navi Mumbai, Residents tab): the new round's closing ranks and residents are there.

Spot values that must not move (the importer also checks them): Kokilaben Navi Mumbai DNB Anaesthesiology, DNB Quota, Open: 2025 R1 21,699, R2 25,059, R3 29,892, Stray 33,685, and 2026 R1 20,132. GMC Nagpur MD Anaesthesiology 2026 R1: 12 allotments, OBC closing 17,213.

### 1.5 Provisional → final

Add `mcc/<year>/<round>_final.pdf` next to the provisional key and run 1.2 and then 1.3 (steps a and e). Per year and round, the build uses the final PDF once it is parsed and never both (`check_db` section 5 reports what changed). The import then drops the provisional source. Keep the provisional key in the JSON.

### 1.6 Code a new round or year may need

These are hard-coded today. Each one is a code change, so test it in a `/tmp` copy (`npm run typecheck && npm run lint && npm run test`) before 1.3 b–d:
- **Reach labels count 2024, 2025 and the latest year's R1 only** (`src/features/decide/lib/reach.ts`: `LATEST_YEAR`, `PAST_YEARS`, `classifyReach`, `reachWindow`). A 2026 R2 result appears automatically in every grid (Rounds by year, Last ranks, Allotments, Rank scan, Rank journey, college pages), but the labels ignore it until this changes. Options' "leave out provisional" toggle also assumes only the latest R1 can be provisional.
- **The virtual-vacancy guard compares against that year's R1 only** (`check_db.py` section 4, and `export_medpath.py` near "virtual-vacancy rows"). A Round 3 virtual list can hold seats first allotted in Round 2, so widen both guards to every earlier round of the year (the Seatora importer already does this) before importing R3 lists.
- **A new counselling year (2027):** `LATEST_YEAR`/`PAST_YEARS`/`YEARS` in `reach.ts`, `YEAR` in `export_notices.py`, `MAX_MARKS` in `export_merit_stats.py`, `AIR` in `export_her.py` if her rank changes, and the importer's rank-year rule for residents.

## 2. Restore from a backup

First decide whether a restore is the right tool:
- **Bad MCC data after an import:** don't restore. Re-import a good bundle, because the importer makes the MCC tables match the bundle and leaves accounts alone. The previous bundle is in the last planner backup:
  ```sh
  mkdir -p /tmp/prev && tar -xzf ~/Backups/neetpg/<timestamp>/neetpg-planner-data.tgz -C /tmp/prev data/medpath-r3 data/medpath-private data/official_sources.json
  # then 1.3 step e with /tmp/prev/data/medpath-r3 and /tmp/prev/data/medpath-private; afterwards: rm -rf /tmp/prev (it holds names)
  ```
- **Accounts, hides or waitlist lost, or a migration broke the database:** restore a Supabase backup as below.
- **Planner files damaged:** run `cd ~/Backups/neetpg/<timestamp> && shasum -a 256 -c SHA256SUMS`, then `tar -xzf neetpg-planner-data.tgz -C "$PLANNER"`. This overwrites `data/` and `public/data/`.

Backups live in `~/Backups/neetpg/`: `supabase-<timestamp>/` for production and `<timestamp>/` from `backup_all.sh`. They hold accounts, sessions and resident names, so they are owner-only and never shared. `backup_all.sh` keeps only the newest 10 directories of either kind, so copy any Supabase backup you want to keep off this Mac.

### 2.1 Pick the backup and compare schemas

```sh
B=~/Backups/neetpg/supabase-<timestamp>
grep -q '"verified": true' "$B/manifest.json" && echo verified          # only a verified backup restores
gunzip -c "$B/_prisma_migrations.ndjson.gz" \
  | python3 -c 'import sys, json; [print(r["migration_name"]) for r in map(json.loads, sys.stdin) if r["finished_at"]]' \
  | sort > /tmp/backup-migrations.txt
ls "$D/prisma/migrations" | grep -v toml | sort | diff /tmp/backup-migrations.txt - && echo "same schema"
```
(`$D` is a snapshot as in 1.3 b.) A backup taken in 1.3 a, right before a migration, has an **older** schema. The restore inserts whole rows, so it needs exactly the backup's schema.

### 2.2 Rehearse on local Postgres first

This was rehearsed end to end on 15 Nov with the newest Supabase backup. Restore and verify took about 30 seconds.
```sh
set -a; . ~/.config/seatora/db.env; set +a
BASE="${DATABASE_URL%%\?*}"; TARGET="${BASE%/*}/restore_test"
"$PG/createdb" --maintenance-db="$BASE" restore_test
```
Then follow 2.3 with this `TARGET` (it is empty, so skip "Empty it"), and sign in to a local build against it if you want. Finish with `"$PG/dropdb" --maintenance-db="$BASE" restore_test`.

### 2.3 Restore

```sh
# 0. production only: back up the current state first, even if broken (1.3 a), so nothing is lost
TARGET="$DIRECT_URL"                                        # or the local rehearsal URL

# 1. Empty it. Same schema: empty every table but the migration log
"$PG/psql" "$TARGET" -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN EXECUTE (SELECT 'TRUNCATE ' || string_agg(format('public.%I', tablename), ', ') || ' CASCADE' FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'); END \$\$;"
#    Older schema instead: drop the schema, then build the backup's schema from its own migrations
"$PG/psql" "$TARGET" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
#    Supabase only (these roles don't exist locally): Supabase's default grants on the new schema
"$PG/psql" "$TARGET" -v ON_ERROR_STOP=1 -c "GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role; GRANT ALL ON SCHEMA public TO postgres;"
M=/tmp/restore-schema/prisma; rm -rf "$M" && mkdir -p "$M/migrations"
cp "$D/prisma/schema.prisma" "$M/" && cp "$D/prisma/migrations/migration_lock.toml" "$M/migrations/"
for m in $(cat /tmp/backup-migrations.txt); do cp -R "$D/prisma/migrations/$m" "$M/migrations/"; done
cd "$D" && DATABASE_URL="$TARGET" npx prisma migrate deploy --schema "$M/schema.prisma"

# 2. restore, then prove every row is identical
DATABASE_URL="$TARGET" node "$PLANNER/tools/backup_medpath_db.mjs" "$D" --restore "$B"
DATABASE_URL="$TARGET" node "$PLANNER/tools/backup_medpath_db.mjs" "$D" --verify "$B"     # "every table identical to …"

# 3. older schema only: migrate forward to the current code, as production did
cd "$D" && DATABASE_URL="$TARGET" npx prisma migrate deploy
# 4. Supabase: lock down again (new tables), then 1.4
"$PG/psql" "$TARGET" -v ON_ERROR_STOP=1 -f "$PLANNER/tools/sql/supabase_lockdown.sql"
```
- The restore refuses a table that isn't empty, a table missing from the database ("run prisma migrate deploy") and a checksum mismatch. It loads parents before children in one transaction.
- While the tables are empty, the live site shows "Data unavailable" for Decide. Public pages keep working.
- If the backup's MCC data is older than the planner's current bundle, run 1.3 step e afterwards.
- The schema drop and re-grant (the "older schema" path) was rehearsed on local Postgres only, not on Supabase itself. The lockdown in step 4 is what keeps the API roles out of every table.

## 3. Rotate the access secret or change the allowed email

The gate (`src/middleware.ts`, docs/ARCHITECTURE.md "Access gate") lets only a signed-in account on `SEATORA_ALLOWED_EMAILS` into `/decide` and `/api/v1`. The access cookie is an HMAC keyed with `SITE_ACCESS_SECRET` plus the allowlist, so changing either one voids every cookie. Production needs both variables, or it denies everything. Env changes reach the site only with a new deployment.

Set the variables in Vercel → Seatora project → Settings → Environment Variables (Production), or with the CLI from a snapshot directory with the IDs loaded (1.3 b and d). Update `~/.config/seatora/vercel.env` to match.

**Rotate `SITE_ACCESS_SECRET`.** Do this if a cookie, device or the secret may have leaked. It is the only way to void a copied access cookie before its 30 days run out.
```sh
NEW=$(openssl rand -hex 32)                                 # 32+ random characters; nobody types it
printf '%s' "$NEW" | npx --yes vercel@latest env add SITE_ACCESS_SECRET --environment production --sensitive --force
sed -i '' "s/^SITE_ACCESS_SECRET=.*/SITE_ACCESS_SECRET=$NEW/" ~/.config/seatora/vercel.env; unset NEW
npx --yes vercel@latest deploy --prod --yes                 # redeploy the live commit from its snapshot
```
(`--force` overwrites the old value; flags as in Vercel CLI 65. Other variables work the same way: pipe the value into `env add <NAME> --environment production --sensitive --force`. Remove one with `env remove <NAME> --environment production --confirm-name <NAME>`.) Afterwards the invited account signs in again with the same password. Accounts and sessions in the database are untouched.

**Change the allowed email** (a different person, or the same person's new address):
1. Back up Supabase (1.3 a).
2. Check that nobody has already claimed the address:
   `"$PG/psql" "$DIRECT_URL" -c "SELECT id, \"createdAt\" FROM \"User\" WHERE lower(email) = lower('<new email>')"`.
   If a row exists and the invitee didn't create it, delete it (its sessions cascade). Anyone who knows its password would otherwise get in.
3. In Vercel, set `SEATORA_ALLOWED_EMAILS=<new email>` (comma-separated for several; case and spaces don't matter) and a temporary `SEATORA_INVITE_CODE` from `openssl rand -hex 16`. Redeploy.
4. Give the code to the invitee yourself, outside Seatora. They open `/signup` and create the account with that email and code. Nothing verifies the email, which is why the code exists.
5. Remove `SEATORA_INVITE_CODE` and redeploy. Sign-up is then closed: any attempt gets "That email and invite code don't match an invite."
6. The old account can still enter a correct password, but gets "This account doesn't have access." and no session. Delete its `User` row if it is no longer wanted (after a backup).

**Delete an account on request.** Deleting a `User` row keeps its feature requests, unlinked (`onDelete: SetNull`), and the privacy notice says they go with the account, so delete them first: `DELETE FROM "FeatureRequest" WHERE "userId" = '<id>' OR lower(email) = lower('<email>')`.

**Set the owner** (`SEATORA_OWNER_EMAILS`, who reads every request and its email on `/decide/requests`): only an address whose account the owner created themselves. Check its `User` row as in step 2 first, and never add an address without an account while `SEATORA_INVITE_CODE` is set: nothing verifies sign-up emails, so whoever holds the code could claim it.

Her profile and choice lists live in her browser, not in the account, so changing the account doesn't move or delete them.

## 4. What each check means

| Check | Passing looks like | It guards against | If it fails |
|---|---|---|---|
| `fetch_official.sh` | `ok <key> (<size>)` | MCC moving a link (the download is HTML, not a PDF) | Find the new link on the MCC page and update the JSON |
| `check_db.py` 1. completeness | Every result PDF has plausible rows (main round 10,000+, stray 100+) from rank 1; admitted lists 1,000+ rows, ≤ 5 duplicate rolls; merit lists 100,000+ | Pages or rows dropped while parsing | Re-download; MCC may have changed the layout |
| 2. sanity | No allotment with a college but no course; categories only Open, OBC, SC, ST, EWS (± PwD) | Columns read out of place | Inspect the PDF's rows in `data/build/rows/` |
| 3. cross-checks | 2026 R1 matches the saved Rank & Seats rows and her R1 lock list; NBEMS rank vs score has no inversions; known values (GMC Nagpur 12 seats, OBC 17,213) | Wrong ranks, colleges or courses | A parser or `build_db.py` regression |
| 4. seat lists | Seats per file = the total the PDF prints; every row has a college and course; one course per MCC code; no row on another state's college; the newest virtual vacancy rows have an R1 allotment | Seat rows lost or put on the wrong college | One college under two keys (merge it with evidence), or 1.6 for R3 lists |
| 5. final vs provisional | One result PDF per year and round, with what changed when the final replaced the provisional | Counting a round twice | Check the file names (1.1) |
| 6. merit + privacy | The 2026 result is loaded; no person's name, e-mail or phone in any college key, name or slug | Personal data leaking into the public bundle | Fix the college's curated label; never ship around it |
| 7. college identity | Every curated same/distinct decision holds; no two keys share a display name + PIN or an MCC id unless declared distinct; states filled; retired keys stay retired | False merges (five judge rounds found them) and silent splits | Add an evidence-backed entry to `data/institute_aliases.json` (and `data/retired_keys.json`) |
| 8. terms | Every MCC profile link is the college's own MCC id; the known wrong-profile cases stay fixed | One college showing another's fee or bond | `export_medpath.py --fix-official` |
| 9.–10. bonds | One BOND term per college + programme with the status `data/curated/bond_status.json` gives; verified documents, state rules with their official URL; leaving penalties kept | A bond shown from the wrong document, or a guess shown as fact | `docs/BOND_STATUS.md` in the planner |
| 11. bundle (schema 2) | Allotments carry candidate category, choice number and previous seat as printed, and every previous seat is that rank's allotment one round back; clinical facts and fees keyed to bundle colleges; manifest complete | A bundle that doesn't match the database it came from | Re-export; run `check_db` on both bundles |
| `verify_her_pdf.py` | Exit 0: every closing rank in her courses is found on its PDF row (second extraction), and single-round files recompute to the same closing rank | A parser bug that both pipelines would otherwise share | Read `data/build/audit/pdf_crosscheck.json` |
| `export_medpath.py` guards | Runs to the end | Reading a names table (privacy guard), two PDFs for one round, a source without an https official URL, a retired key without `retired_keys.json`, the virtual-vacancy guard | The message names the rule |
| `export_residents.py` | `residents N …`; no names printed | A resident on a college the public bundle doesn't have; roll numbers or ids leaking (only 9 fields allowed) | Re-run `export_medpath.py` first |
| `backup_medpath_db.mjs` | `verified <dir>`; `--verify`: "every table identical" | A partial backup (live counts vs file lines), or a restore that differs from the backup row by row | Don't migrate or import until a backup verifies |
| `prisma migrate deploy` | "All migrations have been successfully applied" / "No pending migrations" | The schema behind the code | Read the failing migration; restore (2) if it half-applied |
| `supabase_lockdown.sql` | The closing table lists every table with `rls = t`, `anon_select = f`, `auth_select = f` | Supabase's public Data API reading tables with the publishable key | Re-run it; never skip it after a migration |
| `db:import` validation | Nothing written until every file's sha256 and row count match the manifest and every row passes its schema | A corrupted or hand-edited bundle | Re-export |
| `db:import` spot checks (inside the transaction) | `Committed. Spot checks passed`: Kokilaben closing ranks (1.4), GMC Nagpur 12 allotments with OBC 17,213, no provisional 2026 R1, every seat list sums to its PDF total, every newest virtual vacancy has an earlier allotment, NBEMS top score, previous seats one round back (and 2023 R2 rank 23's journey), retired keys resolve, every DB count = the bundle's, User/Session/Waitlist counts unchanged | Any import that would change known facts or touch accounts | Rolled back, nothing written: fix the data, re-export |
| `db:import-residents` | `rejected: 0`, `2 spot checks passed` (two known 2025 residents from the private manifest) | Names on missing colleges or courses (rejected and listed, never guessed); a bundle with phones, e-mails or rolls (strict schema) | Run `db:import` first, or re-export residents |
| App tests (code changes) | `npm run typecheck && npm run lint && npm run test` clean; `npm run test:e2e` with `E2E_EMAIL`, `E2E_PASSWORD`, `SEATORA_INVITE_CODE` | Regressions before deploy | Fix before 1.3 d |
| Live checks (1.4) | `/decide` 307 to login, `/api/v1/meta` 401, public pages 200, signed-in screens show the new round | The gate open, or a deploy or import that didn't land | Redeploy or re-import; restore only as in 2 |
