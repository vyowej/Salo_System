import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useAuth } from '../../../hooks/useAuth';
import customerService from '../../../services/customerService';
import { Input } from '../../../components/forms';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';

const phonePattern = /^(\+63|0)\d{10,11}$/;

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: user?.name || '',
    username: user?.username || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });

  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState({});
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [addresses] = useState(() => customerService.getSavedAddresses());

  const validateForm = () => {
    const nextErrors = {};

    if (!formData.name.trim()) {
      nextErrors.name = 'Full name is required.';
    }

    if (!formData.username.trim()) {
      nextErrors.username = 'Username is required.';
    }

    if (!formData.email.trim()) {
      nextErrors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      nextErrors.email = 'Please enter a valid email address.';
    }

    if (formData.phone && !phonePattern.test(formData.phone.replace(/\s+/g, ''))) {
      nextErrors.phone = 'Use a valid Philippine mobile number format.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    updateUser(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <CustomerLayout>
      <Modal
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        title="Deactivate account"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button variant="ghost" size="sm" onClick={() => setDeactivateOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => setDeactivateOpen(false)}>
              Confirm Deactivation
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
          Deactivating your account will disable access to your saved addresses, favorites, and order history. This action is not yet available in the current frontend build.
        </p>
      </Modal>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Account & Preferences
        </span>
        <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)' }}>
          Profile Settings
        </h1>
        <p className="page-subtitle">
          Manage your personal details, saved delivery locations, and account controls.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-5)', maxWidth: 900 }}>
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-8)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', paddingBottom: 'var(--space-6)', borderBottom: '1px solid var(--border-secondary)' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--accent-subtle)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 700,
            }}>
              {(user?.name || 'CS').substring(0, 2).toUpperCase()}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {user?.name || 'Customer'}
                </h2>
                <Badge variant="primary" size="sm">Customer</Badge>
              </div>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                @{user?.username || 'user'} · Member since 2026
              </p>
            </div>
          </div>

          {saved && (
            <div style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--status-success-bg)',
              color: 'var(--status-success-text)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-sm)',
              marginBottom: 'var(--space-4)',
            }}>
              ✓ Profile information saved successfully.
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="grid-cols-2" style={{ gap: 'var(--space-3)' }}>
              <Input
                id="prof-name"
                label="Full Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={errors.name}
                required
              />
              <Input
                id="prof-username"
                label="Username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                error={errors.username}
                required
              />
            </div>

            <Input
              id="prof-email"
              type="email"
              label="Email Address"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              error={errors.email}
              required
            />

            <Input
              id="prof-phone"
              type="tel"
              label="Phone Number"
              placeholder="09XX XXX XXXX"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              error={errors.phone}
              helper="Used by delivery riders and restaurant hosts."
            />

            <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" variant="primary" size="md">
                Save Changes
              </Button>
            </div>
          </form>
        </div>

        <div id="saved-addresses" style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-xs)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Delivery</p>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 0' }}>Saved Addresses</h2>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/customer/profile#saved-addresses')}>
              Manage addresses
            </Button>
          </div>

          {addresses.length === 0 ? (
            <div style={{ padding: 'var(--space-4)', border: '1px dashed var(--border-primary)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
              No saved delivery addresses yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              {addresses.slice(0, 3).map((address) => (
                <div key={address.id} style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--surface-secondary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{address.label}</strong>
                    {address.isDefault && <Badge variant="success" size="sm">Default</Badge>}
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.6 }}>{address.street}</p>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>{address.city} · {address.recipientName} · {address.phone}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-xs)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Account access</p>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 0' }}>Change Email</h2>
            </div>
            <Button variant="primary" size="sm" disabled>
              Not available yet
            </Button>
          </div>
        </div>

        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-xs)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Security</p>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 0' }}>Change Password</h2>
            </div>
            <Button variant="primary" size="sm" disabled>
              Not available yet
            </Button>
          </div>
        </div>

        <div style={{
          background: 'var(--status-danger-bg, rgba(239, 68, 68, 0.08))',
          border: '1px solid var(--status-danger-border, rgba(239, 68, 68, 0.25))',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-xs)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-danger-text, #b91c1c)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Danger zone</p>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 0' }}>Deactivate Account</h2>
            </div>
            <Button variant="danger" size="sm" onClick={() => setDeactivateOpen(true)}>
              Deactivate
            </Button>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
