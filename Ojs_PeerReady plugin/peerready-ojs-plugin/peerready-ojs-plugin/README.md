# ScholarLens OJS Plugin

AI-powered manuscript review bridge between Open Journal Systems (OJS) and ScholarLens.

**Compatible with:** OJS 3.3.x and OJS 3.4.x  
**Plugin type:** Generic Plugin  
**Install directory:** `plugins/generic/peerready/`

---

## What This Plugin Does

When an author submits a manuscript to your OJS journal, this plugin:

1. Detects the new submission via the OJS hook system
2. Downloads the manuscript file (PDF or DOCX) from OJS storage
3. POSTs the file and metadata to your ScholarLens deployment
4. Stores the ScholarLens session ID against the OJS submission
5. Shows a live status badge ("Reviewing…") in the OJS workflow sidebar
6. When ScholarLens completes the review, receives the callback and:
   - Creates an editorial discussion note with the verdict and score summary
   - Sends an email notification to the assigned editor
   - Updates the sidebar to show "View full report" button linking to ScholarLens

---

## File Structure

```
plugins/generic/peerready/
├── ScholarLensPlugin.php              Main plugin class — hook registration, submission handling
├── ScholarLensSettingsForm.php        Admin settings form
├── index.php                        Required OJS entry point
├── version.xml                      Plugin version manifest
├── classes/
│   └── ScholarLensApiKeyAuth.php      API key validation helper
├── api/
│   └── v1/
│       └── peerready/
│           └── ScholarLensApiHandler.php   REST callback endpoints
├── templates/
│   ├── peerreadySidebar.tpl         Workflow sidebar block
│   └── settingsForm.tpl             Admin settings form template
├── locale/
│   └── en_US/
│       └── locale.po                English UI strings
├── styles/
│   └── peerready.css                Sidebar and badge styles
└── README.md                        This file
```

---

## Installation

### Step 1: Copy the plugin to OJS

```bash
cp -r peerready/ /path/to/ojs/plugins/generic/peerready/
```

Set correct file permissions:

```bash
chown -R www-data:www-data /path/to/ojs/plugins/generic/peerready/
chmod -R 755 /path/to/ojs/plugins/generic/peerready/
```

### Step 2: Enable in OJS

1. Log into OJS as Journal Manager
2. Go to **Settings > Website > Plugins**
3. Find **ScholarLens AI Manuscript Review** under Generic Plugins
4. Click the checkbox to enable it
5. Click **Settings**

### Step 3: Configure the plugin

In the settings form, enter:

| Field | Value |
|-------|-------|
| **ScholarLens URL** | Base URL of your ScholarLens deployment, e.g. `https://peerready.yourinstitution.ac.ug` |
| **API key** | A `pr_live_` API key created in your ScholarLens account under Settings > API keys, with scopes `review:write`, `manuscript:write`, `webhook:manage` |
| **Auto-review** | Enabled = every new submission is reviewed automatically |

Click **Test connection** to verify OJS can reach ScholarLens before saving.

### Step 4: Add the ScholarLens API key to OJS as a trusted caller

In your ScholarLens Admin panel, add the OJS installation's IP address or domain to the allowed API callers list. This allows ScholarLens to call back to the OJS webhook endpoint.

### Step 5: Register the callback URL in ScholarLens

The callback URL format is:

```
https://your-ojs-domain.ac.ug/index.php/{journalPath}/api/v1/peerready/review-complete/{submissionId}
```

ScholarLens calls this URL automatically when a review completes. No manual registration is needed — the plugin passes the callback URL in the `/api/review/start` request body.

---

## How the Callback Endpoint Works

ScholarLens sends a POST request to the callback URL with this JSON body:

```json
{
  "sessionId":    "uuid",
  "verdict":      "major_revision",
  "overallScore": 54,
  "summaryNote":  "The manuscript presents a novel framework... primary concern is...",
  "reportUrl":    "https://peerready.yourinstitution.ac.ug/manuscripts/review/uuid"
}
```

The plugin:
- Validates the Bearer token matches the stored API key
- Updates OJS submission settings with the verdict and score
- Creates an editorial discussion note in the Review stage
- Sends an email notification to the assigned editor
- Returns `{"ok": true}` with HTTP 200

---

## OJS Hooks Used

| Hook | Purpose |
|------|---------|
| `Submission::add` | Fires when a new submission is saved — triggers the ScholarLens upload |
| `Template::Workflow` | Injects the ScholarLens sidebar block into the workflow page |
| `LoadHandler` | Registers the `/api/v1/peerready/*` REST endpoints |

---

## Database Keys (stored in submission_settings)

| Key | Type | Description |
|-----|------|-------------|
| `peerreadySessionId` | string | ScholarLens review session UUID |
| `peerreadyManuscriptId` | string | ScholarLens manuscript UUID |
| `peerreadyStatus` | string | `pending`, `reviewing`, `complete`, `failed` |
| `peerreadyVerdict` | string | `accept`, `minor_revision`, `major_revision`, `reject` |
| `peerreadyScore` | int | Overall score (0-80) |
| `peerreadyApiBase` | string | ScholarLens base URL (cached for sidebar link generation) |

---

## Troubleshooting

### Plugin does not appear in OJS plugin list
- Verify `version.xml` exists and is valid XML
- Check `index.php` returns an instance of `ScholarLensPlugin`
- Check file ownership: `www-data` or your web server user must be able to read the files

### Submission is not being sent to ScholarLens
- Check the OJS error log: `tail -f /path/to/ojs/cache/fc-plugins.php` and PHP error log
- Verify the plugin is enabled for the journal (not just installed)
- Verify auto-review is enabled in plugin settings
- Confirm the submission has a file attached (the hook fires but skips if no primary file exists)

### Callback is not received / review never completes in OJS
- Verify ScholarLens can reach your OJS server (firewall, SSL certificate)
- Test the callback URL manually: `curl -X POST https://your-ojs/index.php/journal/api/v1/peerready/review-complete/1 -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" -d '{"sessionId":"test","verdict":"accept","overallScore":72,"summaryNote":"test","reportUrl":"http://test"}'`
- Check PHP error log for `[ScholarLens]` prefixed entries

### "View full report" button is not appearing
- Confirm the review status in `submission_settings` for the submission ID: `SELECT setting_value FROM submission_settings WHERE submission_id=X AND setting_name='peerreadyStatus';`
- Status must be `complete` for the button to render

### Test connection button returns error
- CORS: the test is a client-side fetch from the OJS admin UI to ScholarLens — ScholarLens must allow CORS from the OJS domain, or use a server-side proxy
- Verify the URL does not have a trailing slash and is HTTPS

---

## Security Notes

- The API key is stored in the OJS `plugin_settings` table. Protect your OJS database.
- All server-to-server calls from OJS to ScholarLens use HTTPS with SSL certificate verification enabled (`CURLOPT_SSL_VERIFYPEER = true`).
- The callback endpoint uses `hash_equals()` for timing-safe key comparison.
- The API key is masked (CSS `password` class) in the settings form but is stored in plain text — treat it as a shared secret, not a password.

---

## Upgrading the Plugin

1. Copy the new plugin files over the existing directory
2. OJS will detect the version change in `version.xml` automatically
3. No database migration is required — all data is stored in `submission_settings`
4. Test the connection after upgrading to confirm settings are intact

---

## License

GNU General Public License v3.0 — consistent with the OJS codebase license.
