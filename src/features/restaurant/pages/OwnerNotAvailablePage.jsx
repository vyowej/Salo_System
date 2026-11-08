import { Link } from 'react-router-dom';
import OwnerLayout from '../../../layouts/OwnerLayout';

export default function OwnerNotAvailablePage({ title }) {
  return (
    <OwnerLayout>
      <section className="owner-access-card owner-not-available" role="status">
        <span className="owner-access-icon" aria-hidden="true">…</span>
        <h1>{title}</h1>
        <p>This section is not available yet. No business data or actions are simulated here.</p>
        <Link to="/owner">Return to Overview</Link>
      </section>
    </OwnerLayout>
  );
}
