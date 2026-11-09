import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { InstagramRelationFilter, InvitationFilter, InvitationStatus } from '../domain/types';
import { formatDate, formatTimestamp } from '../lib/ids';
import { dataUrlToPngBlob } from '../lib/image.ts';
import { copyInvitation, telLink, whatsappLink } from '../lib/share.ts';
import {
  counts,
  filterInstagramRows,
  filterPhoneRows,
  invitationFilterLabel,
  relationLabel,
  type InstagramContactRow,
  type PhoneContactRow,
} from '../services/ContactService';
import { contactService, eventService, invitationService } from '../services';
import { invitationText } from '../services/EventService';
import { useAppUi } from '../ui/AppUi';
import { Avatar, Dialog } from '../ui/primitives';
import { VirtualList } from '../ui/VirtualList';

type SourceTab = 'phone' | 'instagram';

const PHONE_FILTERS: InvitationFilter[] = ['all', 'pending', 'invited', 'not_answered'];
const INSTAGRAM_FILTERS: InvitationFilter[] = ['all', 'pending', 'invited'];

export function EventWorkspacePage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useAppUi();
  const event = useLiveQuery(async () => {
    if (!eventId) return null;
    return (await eventService.get(eventId)) ?? null;
  }, [eventId]);
  const phoneRows = useLiveQuery(() => (eventId ? contactService.phoneRows(eventId) : []), [eventId]) ?? [];
  const instagramRows =
    useLiveQuery(() => (eventId ? contactService.instagramRows(eventId) : []), [eventId]) ?? [];

  const [tab, setTab] = useState<SourceTab>('phone');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<InvitationFilter>('all');
  const [relation, setRelation] = useState<InstagramRelationFilter>('all');
  const [undoTarget, setUndoTarget] = useState<{ contactId: string; name: string } | null>(null);
  const [phoneMenu, setPhoneMenu] = useState<PhoneContactRow | null>(null);
  const [reachTarget, setReachTarget] = useState<PhoneContactRow | null>(null);
  const [reachPhone, setReachPhone] = useState('');
  const [inviteImageBlob, setInviteImageBlob] = useState<Blob | undefined>();

  const phoneFiltered = useMemo(
    () => filterPhoneRows(phoneRows, query, status),
    [phoneRows, query, status],
  );
  const igFiltered = useMemo(
    () => filterInstagramRows(instagramRows, query, relation, status === 'not_answered' ? 'all' : status),
    [instagramRows, query, relation, status],
  );
  const phoneCounts = counts(phoneRows);
  const igCounts = counts(instagramRows);
  const filters = tab === 'phone' ? PHONE_FILTERS : INSTAGRAM_FILTERS;

  useEffect(() => {
    const dataUrl = event?.invitationImage;
    if (!dataUrl) {
      setInviteImageBlob(undefined);
      return;
    }
    let cancelled = false;
    void dataUrlToPngBlob(dataUrl)
      .then((blob) => {
        if (!cancelled) setInviteImageBlob(blob);
      })
      .catch(() => {
        if (!cancelled) setInviteImageBlob(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [event?.invitationImage]);

  if (event === undefined) return <p className="muted">Loading event…</p>;
  if (!event) {
    return (
      <section>
        <p>That event is not on this device.</p>
        <Link to="/">Back to events</Link>
      </section>
    );
  }

  const currentEvent = event;

  function switchTab(next: SourceTab) {
    setTab(next);
    if (next === 'instagram' && status === 'not_answered') setStatus('all');
  }

  async function markPhoneInvited(row: PhoneContactRow) {
    try {
      await invitationService.markInvited({
        eventId,
        contactId: row.contact.id,
        invitedVia: 'phone',
        invitedPhone: row.contact.phones[0]?.value,
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not mark invited.');
    } finally {
      setPhoneMenu(null);
    }
  }

  async function markPhoneNotAnswered(row: PhoneContactRow) {
    try {
      await invitationService.markNotAnswered(eventId, row.contact.id);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not mark not answered.');
    } finally {
      setPhoneMenu(null);
    }
  }

  async function markInstagramInvited(row: InstagramContactRow) {
    try {
      await invitationService.markInvited({
        eventId,
        contactId: row.contact.id,
        invitedVia: 'instagram',
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not mark invited.');
    }
  }

  async function confirmUndo() {
    if (!undoTarget) return;
    try {
      await invitationService.undo(eventId, undoTarget.contactId);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not unmark invited.');
    } finally {
      setUndoTarget(null);
      setPhoneMenu(null);
    }
  }

  async function archive() {
    await eventService.archive(eventId);
    toast('Event archived.');
    navigate('/');
  }

  async function unarchive() {
    await eventService.unarchive(eventId);
    toast('Event restored.');
  }

  function handlePhoneCheck(row: PhoneContactRow) {
    if (row.status === 'invited') {
      setUndoTarget({ contactId: row.contact.id, name: row.contact.name });
      return;
    }
    if (row.status === 'not_answered') {
      void markPhoneInvited(row);
      return;
    }
    setPhoneMenu(row);
  }

  function openReach(row: PhoneContactRow) {
    const first = row.contact.phones[0]?.value;
    if (!first) {
      toast('No phone number for this contact.');
      return;
    }
    setReachPhone(first);
    setReachTarget(row);
  }

  async function openInstagramProfile(url: string) {
    const copyPromise = copyInvitation(
      invitationText(currentEvent),
      inviteImageBlob ?? currentEvent.invitationImage,
    );
    window.open(url, '_blank', 'noopener,noreferrer');
    const copied = await copyPromise;
    toast(copied ? 'Invitation copied.' : 'Could not copy the invitation.');
  }

  const list = tab === 'phone' ? phoneFiltered : igFiltered;

  return (
    <section>
      <div className="row space">
        <Link to="/" className="muted">
          ← Events
        </Link>
        <div className="row">
          <Link className="btn small ghost" to={`/events/${eventId}/edit`}>
            Edit
          </Link>
          {currentEvent.archivedAt ? (
            <button className="btn small" type="button" onClick={() => void unarchive()}>
              Unarchive
            </button>
          ) : (
            <button className="btn small" type="button" onClick={() => void archive()}>
              Archive
            </button>
          )}
        </div>
      </div>
      <h1 className="page-title">{currentEvent.name}</h1>
      <p className="lede">
        {currentEvent.eventDate ? formatDate(currentEvent.eventDate) : 'No date set'}
        {currentEvent.description ? ` · ${currentEvent.description}` : ''}
      </p>
      {currentEvent.invitationImage ? (
        <img className="invite-image" src={currentEvent.invitationImage} alt="Invitation" />
      ) : null}

      {tab === 'phone' ? (
        <div className="stats three">
          <div className="stat">
            <b>{phoneCounts.pending}</b>
            <span className="muted">Pending</span>
          </div>
          <div className="stat">
            <b>{phoneCounts.invited}</b>
            <span className="muted">Invited</span>
          </div>
          <div className="stat">
            <b>{phoneCounts.notAnswered}</b>
            <span className="muted">Not answered</span>
          </div>
        </div>
      ) : (
        <div className="stats">
          <div className="stat">
            <b>{igCounts.pending}</b>
            <span className="muted">Pending</span>
          </div>
          <div className="stat">
            <b>{igCounts.invited}</b>
            <span className="muted">Invited</span>
          </div>
        </div>
      )}

      <div className="tabs" role="tablist">
        <button className={tab === 'phone' ? 'active' : ''} onClick={() => switchTab('phone')} type="button">
          Phone Contacts ({phoneRows.length})
        </button>
        <button className={tab === 'instagram' ? 'active' : ''} onClick={() => switchTab('instagram')} type="button">
          Instagram ({instagramRows.length})
        </button>
      </div>

      <input
        className="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tab === 'phone' ? 'Search name or phone' : 'Search Instagram username'}
        type="search"
      />

      <div className="chips" style={{ marginTop: 10 }}>
        {filters.map((value) => (
          <button key={value} className={`chip ${status === value ? 'active' : ''}`} onClick={() => setStatus(value)} type="button">
            {invitationFilterLabel(value)}
          </button>
        ))}
        {tab === 'instagram'
          ? (['all', 'followers', 'following', 'both'] as InstagramRelationFilter[]).map((value) => (
              <button
                key={value}
                className={`chip ${relation === value ? 'active' : ''}`}
                onClick={() => setRelation(value)}
                type="button"
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))
          : null}
      </div>

      <div style={{ marginTop: 14 }}>
        {list.length === 0 ? (
          <div className="card empty">
            {tab === 'phone'
              ? 'No phone contacts yet. Import a VCF from the Import tab.'
              : 'No Instagram contacts yet. Import Followers or Following JSON from the Import tab.'}
          </div>
        ) : tab === 'phone' ? (
          <VirtualPhoneList rows={phoneFiltered} onCheck={handlePhoneCheck} onReach={openReach} />
        ) : (
          <VirtualInstagramList
            rows={igFiltered}
            onMark={(row) => void markInstagramInvited(row)}
            onUnmark={setUndoTarget}
            onOpenProfile={(url) => void openInstagramProfile(url)}
          />
        )}
      </div>

      {reachTarget ? (
        <Dialog title={reachTarget.contact.name} onClose={() => setReachTarget(null)}>
          {reachTarget.contact.phones.length > 1 ? (
            <div className="chips" style={{ marginBottom: 12 }}>
              {reachTarget.contact.phones.map((phone) => (
                <button
                  key={phone.normalized || phone.value}
                  className={`chip ${reachPhone === phone.value ? 'active' : ''}`}
                  type="button"
                  onClick={() => setReachPhone(phone.value)}
                >
                  {phone.value}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">{reachPhone}</p>
          )}
          <div className="stack">
            <a className="btn ghost choice" href={telLink(reachPhone)}>
              Call
            </a>
            <a
              className="btn ghost choice"
              href={whatsappLink(reachPhone)}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          </div>
        </Dialog>
      ) : null}

      {phoneMenu ? (
        <Dialog title={phoneMenu.contact.name} onClose={() => setPhoneMenu(null)}>
          <p className="muted">Choose a status for this contact.</p>
          <div className="stack">
            <button
              className="btn ghost choice"
              type="button"
              onClick={() => void markPhoneInvited(phoneMenu)}
            >
              Invited
            </button>
            <button
              className="btn ghost choice"
              type="button"
              onClick={() => void markPhoneNotAnswered(phoneMenu)}
            >
              Not answered
            </button>
          </div>
        </Dialog>
      ) : null}

      {undoTarget ? (
        <Dialog title="Unmark invited?" onClose={() => setUndoTarget(null)}>
          <p>
            Remove invited status from {undoTarget.name}? They will go back to pending.
          </p>
          <div className="actions">
            <button className="btn" type="button" onClick={() => setUndoTarget(null)}>
              Cancel
            </button>
            <button className="btn danger" type="button" onClick={() => void confirmUndo()}>
              Unmark invited
            </button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12.5 10 17.5 19 7"
      />
    </svg>
  );
}

function checkClass(status: InvitationStatus): string {
  if (status === 'invited') return 'check-btn invited';
  if (status === 'not_answered') return 'check-btn missed';
  return 'check-btn';
}

function checkLabel(status: InvitationStatus): string {
  if (status === 'invited') return 'Invited. Click to unmark.';
  if (status === 'not_answered') return 'Not answered. Click to mark invited.';
  return 'Set invitation status';
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        d="M12 5v14M5 12h14"
      />
    </svg>
  );
}

function VirtualPhoneList({
  rows,
  onCheck,
  onReach,
}: {
  rows: PhoneContactRow[];
  onCheck: (row: PhoneContactRow) => void;
  onReach: (row: PhoneContactRow) => void;
}) {
  return (
    <VirtualList
      items={rows}
      estimateSize={88}
      getKey={(row) => row.contact.id}
      renderItem={(row) => (
        <div className="contact-row">
          <button
            className="plus-btn"
            type="button"
            aria-label={`Call or WhatsApp ${row.contact.name}`}
            onClick={() => onReach(row)}
          >
            <PlusIcon />
          </button>
          <div className="contact-main">
            <strong>{row.contact.name}</strong>
            <div className="muted">{row.contact.phones.map((p) => p.value).join(' · ') || 'No phone'}</div>
            {row.status === 'not_answered' ? <div className="muted">Not answered</div> : null}
            {row.invitation?.invitedAt ? (
              <div className="muted">Invited {formatTimestamp(row.invitation.invitedAt)}</div>
            ) : null}
          </div>
          <button
            className={checkClass(row.status)}
            type="button"
            aria-label={checkLabel(row.status)}
            onClick={() => onCheck(row)}
          >
            <CheckIcon />
          </button>
        </div>
      )}
    />
  );
}

function InvitationMarker({
  invited,
  onMark,
  onUnmark,
}: {
  invited: boolean;
  onMark: () => void;
  onUnmark: () => void;
}) {
  if (invited) {
    return (
      <button className="btn small invited" type="button" onClick={onUnmark}>
        Invited
      </button>
    );
  }
  return (
    <button className="btn small primary" type="button" onClick={onMark}>
      Mark Invited
    </button>
  );
}

function VirtualInstagramList({
  rows,
  onMark,
  onUnmark,
  onOpenProfile,
}: {
  rows: InstagramContactRow[];
  onMark: (row: InstagramContactRow) => void;
  onUnmark: (target: { contactId: string; name: string }) => void;
  onOpenProfile: (url: string) => void;
}) {
  return (
    <VirtualList
      items={rows}
      estimateSize={96}
      getKey={(row) => row.contact.id}
      renderItem={(row) => (
        <div className="contact-row">
          <Avatar name={row.instagram.username} imageUrl={row.instagram.profileImageUrl} />
          <div className="contact-main">
            <strong>{row.instagram.username}</strong>
            <div className="muted">{relationLabel(row.instagram)}</div>
            <button
              className="profile-link"
              type="button"
              onClick={() => onOpenProfile(row.instagram.profileUrl || row.instagram.href)}
            >
              Open Instagram profile ↗
            </button>
            {row.invitation?.invitedAt ? (
              <div className="muted">Invited {formatTimestamp(row.invitation.invitedAt)}</div>
            ) : null}
          </div>
          <InvitationMarker
            invited={row.status === 'invited'}
            onMark={() => onMark(row)}
            onUnmark={() => onUnmark({ contactId: row.contact.id, name: row.instagram.username })}
          />
        </div>
      )}
    />
  );
}
