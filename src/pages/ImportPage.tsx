import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { importService } from '../services';
import { summarizeImport, type DuplicateResolutions } from '../services/ImportService';
import type { DuplicateReviewItem, ImportResult, VcfImportPlan } from '../domain/types';
import { useAppUi } from '../ui/AppUi';
import { Dialog } from '../ui/primitives';

export function ImportPage() {
  const { toast } = useAppUi();
  const vcfRef = useRef<HTMLInputElement>(null);
  const followersRef = useRef<HTMLInputElement>(null);
  const followingRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [plan, setPlan] = useState<VcfImportPlan | null>(null);
  const [resolutions, setResolutions] = useState<DuplicateResolutions>({});

  async function handleVcf(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const prepared = await importService.prepareVcf(text);
      if (prepared.reviews.length > 0) {
        setPlan(prepared);
        setResolutions(
          Object.fromEntries(
            prepared.reviews.map((item) => [item.key, { action: 'create' as const }]),
          ),
        );
        return;
      }
      const committed = await importService.commitVcf(prepared, {});
      setResult(committed);
      toast(summarizeImport(committed));
    } catch (error) {
      toast(error instanceof Error ? error.message : 'VCF import failed. Existing data was left unchanged.');
    } finally {
      setBusy(false);
      if (vcfRef.current) vcfRef.current.value = '';
    }
  }

  async function commitReviews() {
    if (!plan) return;
    setBusy(true);
    try {
      const committed = await importService.commitVcf(plan, resolutions);
      setResult(committed);
      setPlan(null);
      toast(summarizeImport(committed));
    } catch (error) {
      toast(error instanceof Error ? error.message : 'VCF import failed. Existing data was left unchanged.');
    } finally {
      setBusy(false);
    }
  }

  async function handleInstagram(file: File, kind: 'followers' | 'following') {
    setBusy(true);
    try {
      const text = await file.text();
      const committed = await importService.importInstagram(text, kind);
      setResult(committed);
      toast(summarizeImport(committed));
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Instagram import failed. Existing data was left unchanged.');
    } finally {
      setBusy(false);
      if (kind === 'followers' && followersRef.current) followersRef.current.value = '';
      if (kind === 'following' && followingRef.current) followingRef.current.value = '';
    }
  }

  return (
    <section>
      <h1 className="page-title">Import</h1>
      <p className="lede">
        Files are parsed in this browser only. Nothing is uploaded. Invitation status is kept when you re-import.
      </p>

      <div className="stack">
        <article className="card">
          <h2>Phone contacts</h2>
          <p className="muted">Import an iCloud-exported .vcf file.</p>
          <input
            ref={vcfRef}
            className="visually-hidden"
            type="file"
            accept=".vcf,text/vcard,text/x-vcard"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleVcf(file);
            }}
          />
          <button className="btn primary" type="button" disabled={busy} onClick={() => vcfRef.current?.click()}>
            Import VCF
          </button>
        </article>

        <article className="card">
          <h2>Instagram friends</h2>
          <p className="muted">Import Followers and Following independently. The same person becomes one Instagram contact.</p>
          <input
            ref={followersRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleInstagram(file, 'followers');
            }}
          />
          <input
            ref={followingRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleInstagram(file, 'following');
            }}
          />
          <div className="row">
            <button className="btn primary" type="button" disabled={busy} onClick={() => followersRef.current?.click()}>
              Import Followers
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => followingRef.current?.click()}>
              Import Following
            </button>
          </div>
        </article>

        {result ? <ImportSummary result={result} /> : null}
      </div>

      <p className="muted" style={{ marginTop: 18 }}>
        After importing, open an <Link to="/">event</Link> to send invitations.
      </p>

      {plan ? (
        <Dialog title="Possible duplicates" onClose={() => setPlan(null)}>
          <p className="muted">Some VCF records could match more than one saved contact. Choose merge or create for each.</p>
          <div className="stack">
            {plan.reviews.map((item) => (
              <ReviewCard
                key={item.key}
                item={item}
                value={resolutions[item.key]}
                onChange={(next) => setResolutions((current) => ({ ...current, [item.key]: next }))}
              />
            ))}
          </div>
          <div className="actions">
            <button className="btn" type="button" onClick={() => setPlan(null)}>
              Cancel
            </button>
            <button className="btn primary" type="button" disabled={busy} onClick={() => void commitReviews()}>
              Import with these choices
            </button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}

function ImportSummary({ result }: { result: ImportResult }) {
  return (
    <article className="card">
      <h2>Import summary</h2>
      <p>{summarizeImport(result)}</p>
      <p className="muted">
        {result.source} · {result.totalRecords} records in file
        {result.errors.length ? ` · ${result.errors.length} notes` : ''}
      </p>
    </article>
  );
}

function ReviewCard({
  item,
  value,
  onChange,
}: {
  item: DuplicateReviewItem;
  value?: DuplicateResolutions[string];
  onChange: (value: DuplicateResolutions[string]) => void;
}) {
  return (
    <div className="review-item">
      <strong>{item.incoming.name}</strong>
      <div className="muted">{item.incoming.phones.map((p) => p.value).join(' · ')}</div>
      <label className="row">
        <input
          type="radio"
          checked={!value || value.action === 'create'}
          onChange={() => onChange({ action: 'create' })}
        />
        Create as a new contact
      </label>
      {item.candidates.map((candidate) => (
        <label key={candidate.contactId} className="row">
          <input
            type="radio"
            checked={value?.action === 'merge' && value.contactId === candidate.contactId}
            onChange={() => onChange({ action: 'merge', contactId: candidate.contactId })}
          />
          Merge with {candidate.name}
          {candidate.phones.length ? ` (${candidate.phones.join(', ')})` : ''}
        </label>
      ))}
    </div>
  );
}
