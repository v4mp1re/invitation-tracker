# Invitation Tracker

Privacy-first Progressive Web App for managing event invitations. Phone contacts come from a local VCF file. Instagram contacts come from local Followers and Following JSON exports. Everything stays in this browser's IndexedDB.

## Run

```bash
npm install
npm run dev
```

Then open the printed local URL. For iPhone Home Screen use, serve over HTTPS (or `localhost`) and add the site from Safari: Share → Add to Home Screen.

```bash
npm test
npm run build
npm run preview
```

## What it does

- Create, edit, open, and archive events
- Import iCloud `.vcf` contacts
- Import Instagram Followers and Following JSON, merged by normalized profile href
- Keep phone and Instagram people in separate tabs
- Invite through the device share sheet or Instagram, then **Mark as Invited** yourself
- Undo invitation status
- Re-import without wiping invitation state
- Export JSON/CSV and restore a JSON backup
- Works offline after the first load

Opening Instagram, a profile, or a share sheet never marks someone invited. There is no backend and no account.
