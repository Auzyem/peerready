# OJS → PeerReady API key integration

PeerReady now authenticates external services with per-user **API keys** (Bearer
tokens) instead of a single shared key. This document is for the operator of an
OJS installation (e.g. CUUL's) that runs the PeerReady OJS plugin.

> There is no PeerReady OJS plugin code in this repository — the plugin lives in
> the OJS installation. This doc covers only the configuration change the
> operator must make there.

## 1. Generate a PeerReady API key

1. Sign in to PeerReady with the account that owns the journal's manuscripts.
   The account must be on a **Pro** or **Team** plan (the required scopes are not
   available on Free or Starter).
2. Go to **Settings → API keys** and click **New key**.
3. Configure:
   - **Name:** something identifiable, e.g. `OJS – <journal name>`.
   - **Environment:** `live`.
   - **Scopes:** select all of:
     - `review:write`
     - `manuscript:write`
     - `webhook:manage`
   - **Expiry:** `Never expires` (or rotate on your own schedule).
4. Click **Create key** and **copy the key immediately** — it starts with
   `pr_live_` and is shown only once. If you lose it, revoke it and create a new one.

## 2. Paste the key into the OJS plugin

In the OJS plugin settings form, set the **PeerReady API key** field
(`peerreadyApiKey`) to the `pr_live_…` value you just copied, replacing any old
shared key. The plugin sends it as:

```
Authorization: Bearer pr_live_xxxxxxxx...
```

No other plugin changes are required — the request format is unchanged; only the
credential is now a scoped PeerReady API key.

## 3. Verify

- Submit a manuscript through the journal's normal OJS flow and confirm it
  appears in PeerReady and a review starts.
- A `403` with `missing required scopes` means the key lacks one of the three
  scopes above — create a new key with all of them.
- A `401 Invalid API key` means the key was mistyped, revoked, or belongs to a
  different environment (`pr_test_` vs `pr_live_`).

## 4. Rotation / revocation

- To rotate: create a new key, update the OJS setting, then revoke the old key
  under **Settings → API keys**.
- Revoking a key takes effect immediately; any service still using it will get
  `401`.
- A PeerReady admin can also revoke any key from **Admin panel → API keys**.
