import { NavLink, Outlet } from 'react-router-dom';
import { isIos, isStandalone } from './primitives';

export function Layout() {
  const showIosHint = isIos() && !isStandalone();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>Invitation Tracker</strong>
          <span>Private, on-device invitations</span>
        </div>
      </header>
      <main className="main">
        {showIosHint ? (
          <div className="banner">
            <strong>Add to Home Screen</strong>
            <ol className="install-steps">
              <li>Tap the Share button in Safari.</li>
              <li>Choose Add to Home Screen.</li>
              <li>Open the app from your Home Screen for the standalone PWA.</li>
            </ol>
          </div>
        ) : null}
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Primary">
        <NavLink to="/" end>
          Events
        </NavLink>
        <NavLink to="/import">Contacts</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
    </div>
  );
}
