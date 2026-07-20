# ScholarLens Rebrand Guide
## Renaming PeerReady → ScholarLens across codebase and Claude Code prompts
### Suite: CUUL Editorial Technology Suite · ScholarLens + PeerEditor · Domain: scholarlens.ac

---

## PART 1 — MASTER RENAME REFERENCE TABLE

Every string that must change, in priority order.

| Was (PeerReady) | Now (ScholarLens) | Where it appears |
|---|---|---|
| `PeerReady` | `ScholarLens` | Display text, comments, UI labels |
| `peerready` | `scholarlens` | File names, folder names, DB table names, env var names, JS variable names |
| `PeerReadyPlugin` | `ScholarLensPlugin` | PHP class names, OJS plugin |
| `peerreadyplugin` | `scholarlensplugin` | OJS plugin registry name |
| `pr_live_` | `sl_live_` | API key prefix format |
| `pr_test_` | `sl_test_` | API key prefix format |
| `PEERREADY_` | `SCHOLARLENS_` | Environment variable names |
| `peerready.app` | `scholarlens.ac` | Domain references |
| `PeerReady AI Review` | `ScholarLens AI Review` | UI sidebar labels in OJS |
| `peerready_session_id` | `scholarlens_session_id` | OJS submission settings keys |
| `peerready_manuscript_id` | `scholarlens_manuscript_id` | OJS submission settings keys |
| `peerready_status` | `scholarlens_status` | OJS submission settings keys |
| `peerready_api_base` | `scholarlens_api_base` | OJS submission settings keys |
| `plugins.generic.peerready.*` | `plugins.generic.scholarlens.*` | OJS locale string keys |
| `PEERREADY_REVIEW_COMPLETE` | `SCHOLARLENS_REVIEW_COMPLETE` | OJS email template key |
| `#peerready-block` | `#scholarlens-block` | OJS CSS IDs |
| `peerready-*` | `scholarlens-*` | OJS CSS class prefixes |
| `peerready-ojs-plugin` | `scholarlens-ojs-plugin` | Plugin directory name |
| Suite name (new) | `CUUL Editorial Technology Suite` | Shared header/footer context |

---

## PART 2 — INFRASTRUCTURE CHANGES (do these first, before any code changes)

These are the irreversible external changes. Do them in order. Each one is independent — a failure on one does not block the others.

### 2A — Vercel

1. Log in to Vercel dashboard
2. Go to the PeerReady project → Settings → General
3. Change **Project Name** from `peerready` to `scholarlens`
4. Go to Settings → Domains
5. Add `scholarlens.ac` as the production domain
6. Remove or redirect the old domain if it had one
7. Update environment variable `NEXT_PUBLIC_APP_URL` from the old URL to `https://scholarlens.ac`
8. Update environment variable `NEXT_PUBLIC_APP_NAME` from `PeerReady` to `ScholarLens`
9. Redeploy (trigger a new deployment — the domain change requires a fresh deploy)

### 2B — Supabase

1. Log in to Supabase dashboard
2. Go to the PeerReady project → Settings → General
3. Change the **Project name** from `peerready` (or whatever it was) to `scholarlens`
   — Note: this changes only the display name, not the project URL/ref. The Supabase project URL (`*.supabase.co`) cannot be changed. Your `NEXT_PUBLIC_SUPABASE_URL` env var stays the same.
4. Go to Settings → API → JWT Secret — no change needed
5. The Supabase URL and anon key do not change. Only the display name changes.

### 2C — Stripe

1. Log in to Stripe dashboard
2. Go to Settings → Business details
3. Update **Business name** / **Statement descriptor** from PeerReady to ScholarLens
4. Go to the Products section — rename each product:
   - "PeerReady Free" → "ScholarLens Free"
   - "PeerReady Starter" → "ScholarLens Starter"
   - "PeerReady Pro" → "ScholarLens Pro"
   - "PeerReady Team" → "ScholarLens Team"
   - "PeerReady Enterprise" → "ScholarLens Enterprise"
   — Note: renaming Stripe Products does NOT change price IDs. Your env vars `STRIPE_PRICE_PRO_MONTHLY` etc. remain valid.
5. Update the Customer Portal branding: Settings → Billing → Customer portal → Business name / logo
6. Update the Checkout branding: Settings → Branding → Business name shown to customers

### 2D — Domain (scholarlens.ac)

1. Register `scholarlens.ac` with your domain registrar
2. Add a CNAME or A record pointing to Vercel's servers (Vercel will prompt you with exact DNS instructions when you add the domain in Step 2A)
3. Add a CNAME for `www.scholarlens.ac` → `scholarlens.ac` (optional redirect)
4. Allow 24-48 hours for DNS propagation
5. Verify SSL certificate is issued by Vercel (automatic via Let's Encrypt)

### 2E — Email sender address

Update your email configuration (Resend or SendGrid):
- Old sender: `noreply@peerready.app` (or whatever was configured)
- New sender: `noreply@scholarlens.ac`
- Update the `EMAIL_FROM` environment variable in Vercel to `noreply@scholarlens.ac`
- Add `scholarlens.ac` as a verified sending domain in Resend/SendGrid
- Update SPF, DKIM, and DMARC DNS records for `scholarlens.ac` (your email provider will give you the exact records)

### 2F — OJS plugin callback URL update

If CUUL's OJS installation has the PeerReady plugin installed and configured:
1. Log in to OJS admin
2. Go to Settings → Website → Plugins → PeerReady AI Manuscript Review → Settings
3. Update the **PeerReady URL** field from the old URL to `https://scholarlens.ac`
4. The API key does not change — the key itself is a random string and is not affected by the domain change
5. Click "Test connection" to verify the new URL works after DNS propagation

---

## PART 3 — CODEBASE FIND-AND-REPLACE

Run these commands from the root of your PeerReady/ScholarLens repository. Order matters — run them exactly as listed to avoid partial replacements.

### 3A — Rename the repository itself (optional but recommended)

```bash
# On GitHub: Settings → Repository name → rename to scholarlens
# Then update your local remote:
git remote set-url origin https://github.com/auzyem/scholarlens.git
```

### 3B — File and folder renames

```bash
# If the OJS plugin directory is inside the repo:
mv plugins/generic/peerready plugins/generic/scholarlens
mv plugins/generic/scholarlens/PeerReadyPlugin.php \
   plugins/generic/scholarlens/ScholarLensPlugin.php
mv plugins/generic/scholarlens/PeerReadySettingsForm.php \
   plugins/generic/scholarlens/ScholarLensSettingsForm.php
mv plugins/generic/scholarlens/api/v1/peerready \
   plugins/generic/scholarlens/api/v1/scholarlens
mv plugins/generic/scholarlens/api/v1/scholarlens/PeerReadyApiHandler.php \
   plugins/generic/scholarlens/api/v1/scholarlens/ScholarLensApiHandler.php
mv plugins/generic/scholarlens/classes/PeerReadyApiKeyAuth.php \
   plugins/generic/scholarlens/classes/ScholarLensApiKeyAuth.php
```

```bash
# Rename ZIP if you have a packaged release:
mv peerready-ojs-plugin.zip scholarlens-ojs-plugin.zip
```


> **On Linux:** replace `sed -i ''` with `sed -i` (no space, no empty string argument).
>
> **Windows alternative:** Open VS Code in the repo root. Use Ctrl+Shift+H. Search for each term above and replace. Check "Include files" to scope to relevant extensions.

### 3D — Spot-check these specific files after the bulk replace

These files contain multiple references and are worth opening and reading through manually after the automated replace:

| File | What to check |
|---|---|
| `lib/apiKeys/generator.ts` | Key prefix strings are now `sl_live_` and `sl_test_` |
| `lib/apiKeys/middleware.ts` | `startsWith('sl_')` check is correct |
| `lib/integrations/peerready.ts` → renamed to `lib/integrations/scholarlens.ts` | All function names and references updated |
| `app/api/integrations/peerready/` → renamed to `app/api/integrations/scholarlens/` | Route paths updated |
| `middleware.ts` | Any hardcoded reference to `peerready` in route names |
| `supabase/migrations/*.sql` | Table names, column names, policy names, function names |
| `.env.local` and `.env.local.example` | All `PEERREADY_*` vars renamed to `SCHOLARLENS_*` |
| `vercel.json` | Route entries, function paths |
| `package.json` | Project name field if set |
| `plugins/generic/scholarlens/index.php` | Returns `new ScholarLensPlugin()` |
| `plugins/generic/scholarlens/version.xml` | Display name in `<application>` tag |
| `plugins/generic/scholarlens/locale/en_US/locale.po` | All `plugins.generic.peerready.*` keys → `plugins.generic.scholarlens.*` |

### 3E — Database migrations for renamed keys

The existing Supabase database has data in columns named `peerready_*` in `submission_settings` (OJS side) and integration-related tables. For the ScholarLens application database, create a new migration:

```sql
-- scholarlens/supabase/migrations/010_rename_to_scholarlens.sql

-- Rename the integration settings row
UPDATE public.integration_settings
SET integration_name = 'scholarlens'
WHERE integration_name = 'peerready';

-- Rename the handoffs table
ALTER TABLE IF EXISTS public.peerready_handoffs
  RENAME TO scholarlens_handoffs;

-- Update the API key prefix stored in existing keys
-- (if any keys were created during testing)
UPDATE public.api_keys
SET key_prefix = 'sl_live_'
WHERE key_prefix = 'pr_live_';

UPDATE public.api_keys
SET key_prefix = 'sl_test_'
WHERE key_prefix = 'pr_test_';

-- Update any integration_settings references
UPDATE public.integration_settings
SET config = config::text::jsonb
WHERE integration_name = 'scholarlens';
```

Run with: `supabase db push`

### 3F — Import path updates

After renaming `lib/integrations/peerready.ts` to `lib/integrations/scholarlens.ts`, update all files that import from it:

```bash
# Find all files importing from the old path
grep -r "from '@/lib/integrations/peerready'" . \
  --include="*.ts" --include="*.tsx" \
  -l

# Each found file: replace the import path
sed -i '' "s|@/lib/integrations/peerready|@/lib/integrations/scholarlens|g" <each file>
```

Same for API route path changes:
```bash
# API routes that were /api/integrations/peerready/* are now /api/integrations/scholarlens/*
# Update any hardcoded URL references to these routes:
grep -r "integrations/peerready" . \
  --include="*.ts" --include="*.tsx" -l
```

### 3G — Environment variable rename in Vercel

In the Vercel dashboard → Project → Settings → Environment Variables:

| Old variable name | New variable name |
|---|---|
| `PEERREADY_API_URL` | `SCHOLARLENS_API_URL` |
| `PEERREADY_API_KEY` | `SCHOLARLENS_API_KEY` |

Update these in Vercel AND in your local `.env.local` file. Then redeploy.

---

## PART 4 — OJS PLUGIN RENAME (complete file list)

The OJS plugin is a separate deliverable. Here is the complete rename checklist for it:

### 4A — Directory and file renames

```
OLD: plugins/generic/peerready/
NEW: plugins/generic/scholarlens/

OLD: PeerReadyPlugin.php          → ScholarLensPlugin.php
OLD: PeerReadySettingsForm.php     → ScholarLensSettingsForm.php
OLD: api/v1/peerready/PeerReadyApiHandler.php
NEW: api/v1/scholarlens/ScholarLensApiHandler.php
OLD: classes/PeerReadyApiKeyAuth.php
NEW: classes/ScholarLensApiKeyAuth.php
```

### 4B — PHP class and method renames

| File | Was | Now |
|---|---|---|
| `ScholarLensPlugin.php` | `class PeerReadyPlugin` | `class ScholarLensPlugin` |
| `ScholarLensPlugin.php` | `'peerreadyplugin'` (registry name) | `'scholarlensplugin'` |
| `ScholarLensPlugin.php` | `'peerready_session_id'` | `'scholarlens_session_id'` |
| `ScholarLensPlugin.php` | `'peerready_manuscript_id'` | `'scholarlens_manuscript_id'` |
| `ScholarLensPlugin.php` | `'peerready_status'` | `'scholarlens_status'` |
| `ScholarLensPlugin.php` | `'peerready_api_base'` | `'scholarlens_api_base'` |
| `ScholarLensPlugin.php` | `'peerready_api_url'` (setting) | `'scholarlens_api_url'` |
| `ScholarLensPlugin.php` | `'peerready_api_key'` (setting) | `'scholarlens_api_key'` |
| `ScholarLensPlugin.php` | `'peerready_auto_mode'` (setting) | `'scholarlens_auto_mode'` |
| `ScholarLensApiHandler.php` | `class PeerReadyApiHandler` | `class ScholarLensApiHandler` |
| `ScholarLensApiHandler.php` | `$this->_handlerPath = 'peerready'` | `$this->_handlerPath = 'scholarlens'` |
| `ScholarLensApiHandler.php` | `PluginRegistry::getPlugin('generic', 'peerreadyplugin')` | `PluginRegistry::getPlugin('generic', 'scholarlensplugin')` |
| `ScholarLensApiKeyAuth.php` | `class PeerReadyApiKeyAuth` | `class ScholarLensApiKeyAuth` |
| `ScholarLensApiKeyAuth.php` | `PluginRegistry::getPlugin('generic', 'peerreadyplugin')` | `PluginRegistry::getPlugin('generic', 'scholarlensplugin')` |
| `index.php` | `new PeerReadyPlugin()` | `new ScholarLensPlugin()` |

### 4C — OJS callback URL pattern change

The OJS plugin constructs callback URLs like:
```
OLD: /index.php/{context}/api/v1/peerready/review-complete/{submissionId}
NEW: /index.php/{context}/api/v1/scholarlens/review-complete/{submissionId}
```

In `ScholarLensPlugin.php` → `buildCallbackUrl()` — the path segment `peerready` → `scholarlens` is handled automatically once `$this->_handlerPath` is updated in the ApiHandler.

### 4D — Locale file key renames

In `locale/en_US/locale.po`, every `msgid` that starts with `plugins.generic.peerready.` must become `plugins.generic.scholarlens.`:

```bash
sed -i '' 's/plugins\.generic\.peerready\./plugins.generic.scholarlens./g' \
  plugins/generic/scholarlens/locale/en_US/locale.po
```

Update the display name strings:

```po
# Was:
msgid "plugins.generic.scholarlens.displayName"
msgstr "PeerReady AI Manuscript Review"

# Now:
msgstr "ScholarLens AI Manuscript Review"

# Was:
msgid "plugins.generic.scholarlens.sidebarTitle"
msgstr "PeerReady AI Review"

# Now:
msgstr "ScholarLens AI Review"

# Update the settings description too:
msgid "plugins.generic.scholarlens.description"
msgstr "Automatically submits manuscripts to ScholarLens for AI-powered peer review scoring, adversarial critique, and journal-fit recommendations."

# Update all API key description references:
msgid "plugins.generic.scholarlens.settings.apiUrlDescription"
msgstr "The base URL of your ScholarLens deployment. For example: https://scholarlens.ac"

msgid "plugins.generic.scholarlens.settings.apiKeyDescriptionV2"
msgstr "Create an API key in your ScholarLens account under Settings > API keys. The key needs scopes: review:write, manuscript:write, webhook:manage. It should begin with sl_live_"
```

### 4E — CSS class and ID renames in peerready.css → scholarlens.css

```bash
mv plugins/generic/scholarlens/styles/peerready.css \
   plugins/generic/scholarlens/styles/scholarlens.css
```

Then in the CSS file:
```bash
sed -i '' 's/\.peerready-/.scholarlens-/g' \
  plugins/generic/scholarlens/styles/scholarlens.css
sed -i '' 's/#peerready-/#scholarlens-/g' \
  plugins/generic/scholarlens/styles/scholarlens.css
```

Update the `addStyleSheet` call in `ScholarLensPlugin.php`:
```php
// Was:
$request->getBaseUrl() . '/' . $this->getPluginPath() . '/styles/peerready.css'
// Now:
$request->getBaseUrl() . '/' . $this->getPluginPath() . '/styles/scholarlens.css'
```

### 4F — Sidebar template renames in peerreadySidebar.tpl → scholarlensSidebar.tpl

```bash
mv plugins/generic/scholarlens/templates/peerreadySidebar.tpl \
   plugins/generic/scholarlens/templates/scholarlensSidebar.tpl
```

Update all CSS class references inside the template:
```bash
sed -i '' 's/peerready-/scholarlens-/g' \
  plugins/generic/scholarlens/templates/scholarlensSidebar.tpl
sed -i '' 's/peerready_/scholarlens_/g' \
  plugins/generic/scholarlens/templates/scholarlensSidebar.tpl
```

Update the `getTemplateResource` call in `ScholarLensPlugin.php`:
```php
// Was:
$this->getTemplateResource('peerreadySidebar.tpl')
// Now:
$this->getTemplateResource('scholarlensSidebar.tpl')
```

### 4G — version.xml

No changes required to the XML structure. Optionally bump the release version:
```xml
<release>1.1.0</release>
```

### 4H — OJS installation: replacing the plugin

On the OJS server:
```bash
# 1. Disable the old plugin in OJS admin UI first
# 2. Delete the old directory:
rm -rf /path/to/ojs/plugins/generic/peerready

# 3. Copy the renamed plugin:
cp -r scholarlens-ojs-plugin/ /path/to/ojs/plugins/generic/scholarlens/

# 4. Set permissions:
chown -R www-data:www-data /path/to/ojs/plugins/generic/scholarlens/
chmod -R 755 /path/to/ojs/plugins/generic/scholarlens/

# 5. Enable ScholarLens plugin in OJS admin UI:
# Settings > Website > Plugins > ScholarLens AI Manuscript Review > Enable > Settings
# Enter: URL = https://scholarlens.ac, API key = sl_live_...
```

---

## PART 5 — CLAUDE CODE STARTUP GUIDE UPDATES

The PeerEditor startup guide (`PeerEditor_ClaudeCode_Startup_Guide.md`) references PeerReady by name in the integration sections. Every reference must be updated. Here are the exact string replacements for that file only:

```bash
sed -i '' 's/PeerReady/ScholarLens/g' PeerEditor_ClaudeCode_Startup_Guide.md
sed -i '' 's/peerready/scholarlens/g' PeerEditor_ClaudeCode_Startup_Guide.md
sed -i '' 's/PEERREADY_/SCHOLARLENS_/g' PeerEditor_ClaudeCode_Startup_Guide.md
sed -i '' 's/pr_live_/sl_live_/g' PeerEditor_ClaudeCode_Startup_Guide.md
sed -i '' 's/pr_test_/sl_test_/g' PeerEditor_ClaudeCode_Startup_Guide.md
sed -i '' 's/peerready\.app/scholarlens.ac/g' PeerEditor_ClaudeCode_Startup_Guide.md
```

After running these, manually verify these specific sections in the guide:

| Section | What to check |
|---|---|
| Phase 6 — PeerReady integration module | All references now say ScholarLens. Toggle still says "ScholarLens integration". Route paths are `/api/integrations/scholarlens/*` |
| Phase 8 — Integration settings page | The `integration_settings` row is named `'scholarlens'`. The `isPeerReadyEnabled()` function is renamed to `isScholarLensEnabled()` |
| Environment variables section | `SCHOLARLENS_API_URL` and `SCHOLARLENS_API_KEY` |
| API key scope descriptions | References to `sl_live_` prefix |
| Part 7 boundary definition | "ScholarLens" appears as the partner system name |

---

## PART 6 — SUITE BRANDING ADDITIONS

Now that both products exist under a named suite, add suite-level branding to both codebases.

### 6A — Add to ScholarLens globals.css

```css
/* Suite identity — applied to the about/footer area only */
:root {
  --suite-name: "CUUL Editorial Technology Suite";
  --suite-product-1: "ScholarLens";
  --suite-product-2: "PeerEditor";
}
```

### 6B — Update ScholarLens app/layout.tsx metadata

```typescript
export const metadata: Metadata = {
  title: { default: 'ScholarLens', template: '%s · ScholarLens' },
  description: 'AI-powered manuscript review platform. Part of the CUUL Editorial Technology Suite.',
  metadataBase: new URL('https://scholarlens.ac'),
}
```

### 6C — Update PeerEditor app/layout.tsx metadata

```typescript
export const metadata: Metadata = {
  title: { default: 'PeerEditor', template: '%s · PeerEditor' },
  description: 'Editorial screening and manuscript management platform. Part of the CUUL Editorial Technology Suite.',
  metadataBase: new URL('https://peereditor.ac'), // or whatever PeerEditor's domain is
}
```

### 6D — Footer component in both products

Add a shared footer line to both platforms:

```tsx
<footer style={{ borderTop: '0.5px solid var(--color-border-tertiary)', padding: '12px 24px', fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
  Part of the{' '}
  <strong style={{ color: 'var(--color-text-secondary)' }}>CUUL Editorial Technology Suite</strong>
  {' '}·{' '}
  <a href="https://scholarlens.ac" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none' }}>ScholarLens</a>
  {' '}·{' '}
  <a href="https://peereditor.ac" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none' }}>PeerEditor</a>
</footer>
```

---

## PART 7 — POST-RENAME VERIFICATION CHECKLIST

Run through this list after all changes are made and deployed:

### Infrastructure
- [ ] `https://scholarlens.ac` loads the application with valid SSL
- [ ] Old Vercel URL redirects to `https://scholarlens.ac`
- [ ] `noreply@scholarlens.ac` can send email (test with a sign-up)
- [ ] Stripe checkout shows "ScholarLens" as the merchant name
- [ ] Stripe customer portal shows "ScholarLens" branding

### Codebase
- [ ] Run `grep -r "PeerReady" . --include="*.ts" --include="*.tsx" --include="*.php" -l` — result should be empty
- [ ] Run `grep -r "peerready" . --include="*.ts" --include="*.tsx" --include="*.php" -l` — result should be empty
- [ ] Run `grep -r "PEERREADY" . --include="*.ts" --include="*.tsx" -l` — result should be empty
- [ ] Run `grep -r "pr_live_\|pr_test_" . --include="*.ts" --include="*.tsx" -l` — result should be empty
- [ ] API key generation produces `sl_live_` prefix
- [ ] API key validation accepts `sl_live_` prefix, rejects `pr_live_` prefix

### Database
- [ ] `SELECT * FROM integration_settings WHERE integration_name = 'peerready'` — returns 0 rows
- [ ] `SELECT * FROM integration_settings WHERE integration_name = 'scholarlens'` — returns 1 row
- [ ] `SELECT * FROM api_keys WHERE key_prefix = 'pr_live_'` — returns 0 rows (if any test keys existed)

### OJS plugin
- [ ] Plugin appears as "ScholarLens AI Manuscript Review" in OJS plugin list
- [ ] Plugin sidebar shows "ScholarLens AI Review" label
- [ ] Callback URL in plugin settings form shows `scholarlens.ac`
- [ ] Connection test passes with new domain and a valid `sl_live_` API key
- [ ] Test submission in OJS: submission triggers ScholarLens, callback posts back, audit note says "ScholarLens review completed"

### PeerEditor integration module
- [ ] Settings > Integrations shows "ScholarLens" as the integration name
- [ ] Toggle enables/disables ScholarLens handoff correctly
- [ ] `isScholarLensEnabled()` returns false when disabled, true when enabled
- [ ] When enabled and EiC clicks "Send to ScholarLens", handoff is created in `scholarlens_handoffs` table
- [ ] Manuscript sidebar in PeerEditor shows "ScholarLens advisory review" label when enabled

### Communications
- [ ] Approval email (PeerEditor) mentions ScholarLens in the footer suite line
- [ ] Decision letter (PeerEditor) has footer with ScholarLens and PeerEditor as suite members
- [ ] ScholarLens review-complete notification email says "ScholarLens" not "PeerReady"

---

## PART 8 — WHAT NOT TO CHANGE

These items reference PeerReady in ways that either cannot be changed or should not be changed:

| Item | Reason to leave |
|---|---|
| Supabase project URL (`*.supabase.co`) | Cannot be changed — it is set at project creation and is permanent |
| Stripe price IDs (`price_...`) | These are Stripe-internal identifiers, not user-facing. Your env vars just need renaming |
| Git commit history | Leave as-is. The commit messages reference PeerReady but this is historical record |
| Existing Supabase RLS policy names | Can be left as-is. Policy names are internal identifiers, not user-facing |
| JWT secret and anon key | Cryptographic values, not brand names |
| Your local `.env.local` backups | Keep a copy of the old env file before renaming, in case you need to roll back |

---

## PART 9 — ROLLBACK PLAN

If something breaks after the rename and you need to revert quickly:

1. **Vercel:** Go to project → Deployments → find the last working deployment → click "Promote to Production". This reverts the live site immediately without touching the code.
2. **Supabase migration rollback:** The `010_rename_to_scholarlens.sql` migration renames tables. If you need to roll back: run the inverse SQL manually in the Supabase SQL editor (rename `scholarlens_handoffs` back to `peerready_handoffs`, update `integration_settings` back to `peerready`).
3. **OJS plugin rollback:** Keep the original `peerready/` plugin directory in a backup location before deleting it. If the ScholarLens plugin has issues, copy the backup back and re-enable the old plugin.
4. **API keys:** Any `sl_live_` keys generated after the migration will need to be deleted if rolling back to `pr_live_`. Keys created before the migration (if any) are already `pr_live_` and will work with the rolled-back database.
5. **DNS:** Domain changes take up to 48 hours to propagate. If you need to point `scholarlens.ac` away from the broken deployment, update the DNS record to point to the old Vercel URL.
