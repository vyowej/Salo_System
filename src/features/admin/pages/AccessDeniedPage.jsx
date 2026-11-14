import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import './AdminPages.css';

export default function AccessDeniedPage({ title = 'No access', returnTo = '/admin' }) {
  return (
    <main className="admin-access-denied" aria-labelledby="admin-access-title">
      <p className="admin-page-header__eyebrow">403 · Access restricted</p>
      <h1 id="admin-access-title">{title}</h1>
      <p>Your current SALO account does not have permission to open this page.</p>
      <Link to={returnTo}><Button variant="outline">{returnTo === '/admin' ? 'Return to dashboard' : 'Return to SALO'}</Button></Link>
    </main>
  );
}
