import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fileToInvitationDataUrl } from '../lib/image.ts';
import { eventService } from '../services';
import { useAppUi } from '../ui/AppUi';

export function EventFormPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { toast } = useAppUi();
  const editing = Boolean(eventId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [description, setDescription] = useState('');
  const [invitationMessage, setInvitationMessage] = useState('');
  const [invitationImage, setInvitationImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    void eventService.get(eventId).then((event) => {
      if (!event) {
        toast('Event not found.');
        navigate('/');
        return;
      }
      setName(event.name);
      setEventDate(event.eventDate ?? '');
      setDescription(event.description ?? '');
      setInvitationMessage(event.invitationMessage ?? '');
      setInvitationImage(event.invitationImage ?? null);
    });
  }, [eventId, navigate, toast]);

  async function onPickImage(change: ChangeEvent<HTMLInputElement>) {
    const file = change.target.files?.[0];
    change.target.value = '';
    if (!file) return;
    setImageBusy(true);
    try {
      setInvitationImage(await fileToInvitationDataUrl(file));
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not add the invitation image.');
    } finally {
      setImageBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { name, eventDate, description, invitationMessage, invitationImage };
      const saved = editing && eventId ? await eventService.update(eventId, payload) : await eventService.create(payload);
      toast(editing ? 'Event updated.' : 'Event created.');
      navigate(`/events/${saved.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save event.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <Link to={eventId ? `/events/${eventId}` : '/'} className="muted">
        ← Back
      </Link>
      <h1 className="page-title">{editing ? 'Edit event' : 'New event'}</h1>
      <form className="stack" onSubmit={(e) => void onSubmit(e)}>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </label>
        <label className="field">
          <span>Invitation message</span>
          <textarea
            value={invitationMessage}
            onChange={(e) => setInvitationMessage(e.target.value)}
            placeholder="The text you will copy or share when inviting people."
            maxLength={2000}
          />
        </label>
        <div className="field">
          <span>Invitation image</span>
          <p className="muted" style={{ margin: 0 }}>
            Optional. Copied with the message when you open an Instagram profile.
          </p>
          {invitationImage ? (
            <img className="invite-image" src={invitationImage} alt="Invitation" />
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void onPickImage(e)}
          />
          <div className="image-actions">
            <button
              className="btn small ghost"
              type="button"
              disabled={imageBusy}
              onClick={() => fileRef.current?.click()}
            >
              {imageBusy ? 'Preparing…' : invitationImage ? 'Replace image' : 'Add image'}
            </button>
            {invitationImage ? (
              <button className="btn small" type="button" onClick={() => setInvitationImage(null)}>
                Remove image
              </button>
            ) : null}
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={busy || imageBusy}>
            {editing ? 'Save event' : 'Create event'}
          </button>
        </div>
      </form>
    </section>
  );
}
