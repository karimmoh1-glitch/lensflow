# Google Drive and Dropbox

A folder per client, made on request from the client's page, listed there afterwards.
Files stay in Drive or Dropbox; Daythread stores folder references only.

## Google Drive

- Same Google Cloud project and OAuth client as Gmail / Calendar; enable the **Google Drive
  API** on the project. Scope `drive.file` (non-sensitive: only what Daythread created is
  visible to it). Add it to the OAuth consent screen's scopes.
- On connect Daythread creates `Daythread/Clients` in the person's Drive; client folders
  go inside. A removed root folder is re-created on the next request.
- Disconnect revokes the Google grant.

## Dropbox

1. dropbox.com/developers/apps → Create app → Scoped access → **App folder**.
2. Permissions: `account_info.read`, `files.metadata.read`, `files.content.write`,
   `sharing.write`.
3. Settings → Redirect URIs: `https://daythread.org/api/auth/dropbox/callback`.
4. Copy App key and App secret. Until Dropbox approves **Production** status the app is
   limited to 50 connected users.

| Variable | Value |
|---|---|
| `DROPBOX_APP_KEY` | App key |
| `DROPBOX_APP_SECRET` | App secret |

- OAuth 2 with PKCE and `token_access_type=offline`; access tokens last four hours and are
  refreshed on demand. Client folders live at `/Clients/<name>` inside the app folder; the
  link shown is a shared link Dropbox issues for that path.
- Disconnect revokes the token at Dropbox.
