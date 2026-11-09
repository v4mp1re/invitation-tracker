import { useEffect, useRef, useState } from 'react';
import { SCHEMA_VERSION } from '../domain/types';
import { nowIso } from '../lib/ids';
import { isStoragePersistent, requestPersistentStorage } from '../lib/persistentStorage';
import { downloadBlob } from '../lib/share';
import { exportService } from '../services';
import { useAppUi } from '../ui/AppUi';
import { Dialog, isIos, isStandalone } from '../ui/primitives';

export function SettingsPage() {
  const { toast } = useAppUi();
  const restoreRef = useRef<HTMLInputElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [persistent, setPersistent] = useState<boolean | undefined>();

  useEffect(() => {
    void isStoragePersistent().then(setPersistent);
  }, []);

  async function exportJson() {
    const payload = await exportService.exportJson();
    downloadBlob(
      `invitation-tracker-${payload.exportedAt.slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    );
    toast('JSON backup downloaded.');
  }

  async function exportCsv() {
    const csv = await exportService.exportCsv();
    downloadBlob(`invitation-tracker-${nowIso().slice(0, 10)}.csv`, csv, 'text/csv');
    toast('CSV downloaded.');
  }

  async function restore(file: File) {
    setBusy(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const payload = exportService.validateBackup(parsed);
      const ok = window.confirm('Restore this backup and replace all local data on this device?');
      if (!ok) return;
      await exportService.restore(payload);
      toast('Backup restored.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Restore failed. Existing data was left unchanged.');
    } finally {
      setBusy(false);
      if (restoreRef.current) restoreRef.current.value = '';
    }
  }

  async function deleteAll() {
    if (confirmText !== 'DELETE') return;
    setBusy(true);
    try {
      await exportService.deleteAllData();
      setDeleteOpen(false);
      setConfirmText('');
      toast('All local data deleted.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not delete data.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1 className="page-title">Settings</h1>
      <p className="lede">
        All events, contacts, and invitation state live in this browser&apos;s IndexedDB. There is no account and no
        cloud copy unless you export a backup.
      </p>

      <div className="stack">
        <article className="card">
          <h2>Backup</h2>
          <p className="muted">Export JSON for restore, or CSV for a spreadsheet of event-contact rows. Schema version {SCHEMA_VERSION}.</p>
          <div className="row">
            <button className="btn primary" type="button" onClick={() => void exportJson()}>
              Export JSON
            </button>
            <button className="btn" type="button" onClick={() => void exportCsv()}>
              Export CSV
            </button>
          </div>
          <input
            ref={restoreRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void restore(file);
            }}
          />
          <div style={{ marginTop: 12 }}>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => restoreRef.current?.click()}>
              Restore JSON backup
            </button>
          </div>
        </article>

        {isIos() ? (
          <article className="card">
            <h2>iPhone Home Screen</h2>
            {isStandalone() ? (
              <p className="muted">This app is running in standalone mode.</p>
            ) : (
              <>
                <p className="muted">Safari cannot automatically install PWAs. Add it yourself:</p>
                <ol className="install-steps">
                  <li>Tap Share.</li>
                  <li>Tap Add to Home Screen.</li>
                  <li>Open Invitation Tracker from the Home Screen.</li>
                </ol>
              </>
            )}
          </article>
        ) : null}

        <article className="card">
          <h2>On this device</h2>
          <p className="muted">
            Data stays in this phone&apos;s browser storage for{' '}
            <code style={{ fontSize: '0.85em' }}>invitation-tracker-sandy.vercel.app</code>. There is no cloud copy.
            On iPhone, iOS can still delete unused site storage when the device is low on space unless the browser marks
            it persistent. Export a JSON backup after imports.
          </p>
          <p className="muted">
            Storage protection:{' '}
            {persistent === undefined
              ? 'Checking…'
              : persistent
                ? 'Persistent (harder for iOS to auto-delete)'
                : 'Best-effort (can be cleared under storage pressure)'}
          </p>
          {persistent === false ? (
            <div style={{ marginTop: 10 }}>
              <button
                className="btn ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  void requestPersistentStorage().then((ok) => {
                    setPersistent(ok);
                    toast(ok ? 'Persistent storage enabled.' : 'Could not enable persistent storage.');
                  });
                }}
              >
                Request persistent storage
              </button>
            </div>
          ) : null}
        </article>

        <article className="card">
          <h2>Privacy</h2>
          <p className="muted">
            VCF and Instagram JSON never leave this device. Contact names, numbers, and profile URLs are not written to
            analytics or page URLs. Clearing site data, removing the Home Screen app, or switching phones will lose
            local data unless you exported a backup.
          </p>
        </article>

        <article className="card danger-zone">
          <h2>Delete all data</h2>
          <p className="muted">Export a backup first. This cannot be undone.</p>
          <button className="btn danger" type="button" onClick={() => setDeleteOpen(true)}>
            Delete all data
          </button>
        </article>
      </div>

      {deleteOpen ? (
        <Dialog title="Delete everything?" onClose={() => setDeleteOpen(false)}>
          <p>This removes all events, contacts, and invitation records stored in this browser.</p>
          <p className="muted">Type DELETE to confirm. Consider exporting JSON first.</p>
          <label className="field">
            <span>Confirmation</span>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </label>
          <div className="actions">
            <button className="btn" type="button" onClick={() => setDeleteOpen(false)}>
              Cancel
            </button>
            <button className="btn danger" type="button" disabled={busy || confirmText !== 'DELETE'} onClick={() => void deleteAll()}>
              Delete all data
            </button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
