import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { eventService } from '../services';
import { formatDate } from '../lib/ids';
import { Plus } from 'lucide-react';

export function EventsPage() {
  const events = useLiveQuery(() => eventService.list(), []) ?? [];
  const active = events.filter((event) => !event.archivedAt);
  const archived = events.filter((event) => event.archivedAt);

  return (
    <section>
      <div className="row space">
        <div>
          <h1 className="page-title">Events</h1>
          <p className="lede">Create a gathering, then invite from phone and Instagram contacts stored only on this device.</p>
        </div>
        <Link className="btn primary" to="/events/new">
          <Plus />
        </Link>
      </div>

      {active.length === 0 ? (
        <div className="card empty">
          <p>No events yet. Start with a name and an invitation message.</p>
          <Link className="btn primary" to="/events/new">
            Create event
          </Link>
        </div>
      ) : (
        <div className="stack">
          {active.map((event) => (
            <Link key={event.id} className="card event-card" to={`/events/${event.id}`}>
              <h2>{event.name}</h2>
              <div className="muted">{event.eventDate ? formatDate(event.eventDate) : 'No date set'}</div>
              {event.description ? <div className="muted">{event.description}</div> : null}
            </Link>
          ))}
        </div>
      )}

      {archived.length > 0 ? (
        <>
          <h2 className="lede" style={{ marginTop: 28 }}>
            Archived
          </h2>
          <div className="stack">
            {archived.map((event) => (
              <Link key={event.id} className="card event-card" to={`/events/${event.id}`}>
                <h2>{event.name}</h2>
                <div className="muted">Archived {formatDate(event.archivedAt)}</div>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
