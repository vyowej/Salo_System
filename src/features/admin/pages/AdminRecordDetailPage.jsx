import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import Button from '../../../components/common/Button';
import adminApiService from '../../../services/adminApiService';
import { ConfirmDialog, PageHeader, StateView, StatusBadge } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import useAdminSession from '../contexts/useAdminSession';
import {
  SUPPORTED_RECORD_ENTITIES,
  findRecordByIdInPages,
  getAvailableRecordActions,
  getEntityMeta,
  normalizeAdminRecord,
} from '../utils/adminRecordDetailHelpers';
import './AdminPages.css';

export default function AdminRecordDetailPage({ entity }) {
  useAdminPageSearch({ disabled: true });
  const { id } = useParams();
  const { permissions } = useAdminSession();

  const entityMeta = getEntityMeta(entity);
  const isSupportedEntity = SUPPORTED_RECORD_ENTITIES.has(entity);

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(isSupportedEntity);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [savingAction, setSavingAction] = useState(false);

  const loadRecord = useCallback(async () => {
    if (!isSupportedEntity) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);
    setError('');

    try {
      let raw = null;
      if (entity === 'accounts') {
        raw = await findRecordByIdInPages(
          (page) => adminApiService.getUsers({ page, per_page: 100 }),
          'user_id',
          id,
        );
      } else if (entity === 'administrators') {
        raw = await findRecordByIdInPages(
          (page) => adminApiService.getUsers({ role: 'admin', page, per_page: 100 }),
          'user_id',
          id,
        );
      } else if (entity === 'restaurants') {
        raw = await findRecordByIdInPages(
          (page) => adminApiService.getRestaurants({ page, per_page: 100 }),
          'restaurant_id',
          id,
        );
      } else if (entity === 'riders') {
        raw = await findRecordByIdInPages(
          (page) => adminApiService.getRiders({ page, per_page: 100 }),
          'rider_id',
          id,
        );
      }

      if (!raw) {
        setRecord(null);
        setNotFound(true);
      } else {
        setRecord(normalizeAdminRecord(entity, raw));
      }
    } catch (err) {
      setRecord(null);
      setError(err?.message || 'Unable to load record details.');
    } finally {
      setLoading(false);
    }
  }, [entity, id, isSupportedEntity]);

  useEffect(() => {
    loadRecord();
  }, [loadRecord]);

  const actions = useMemo(
    () => getAvailableRecordActions(entity, record, permissions),
    [entity, record, permissions],
  );

  const handleConfirmAction = async (reason) => {
    if (!pendingAction || !record || savingAction) return;
    setSavingAction(true);
    setActionError('');
    setActionNotice('');

    try {
      if (entity === 'accounts' || entity === 'administrators') {
        await adminApiService.updateUser(record.id, {
          account_status: pendingAction.nextStatus,
          reason: reason || undefined,
        });
      } else if (entity === 'restaurants') {
        await adminApiService.updateRestaurantStatus(record.id, {
          status: pendingAction.nextStatus,
          reason: reason || '',
        });
      } else if (entity === 'riders') {
        if (pendingAction.key === 'activate_rider') {
          await adminApiService.activateRider(record.id);
        } else {
          await adminApiService.updateRiderStatus(record.id, {
            status: pendingAction.nextStatus,
            reason: reason || '',
          });
        }
      }

      setPendingAction(null);
      setActionNotice('Record updated successfully.');
      await loadRecord();
    } catch (err) {
      setActionError(err?.message || 'Unable to update record.');
    } finally {
      setSavingAction(false);
    }
  };

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title={record?.title || entityMeta.title}
          description={`Reference: #${id || ''}`}
          actions={(
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to={entityMeta.backPath}>
                <Button variant="outline" size="sm">{entityMeta.backLabel}</Button>
              </Link>
              {isSupportedEntity && (
                <Button variant="secondary" size="sm" onClick={loadRecord} disabled={loading}>
                  Refresh
                </Button>
              )}
            </div>
          )}
        />

        {!isSupportedEntity ? (
          <StateView
            state="empty"
            title="Unsupported record type"
            description={`No detail endpoint is available for "${entity}".`}
            action={<Link to={entityMeta.backPath}><Button variant="outline" size="sm">{entityMeta.backLabel}</Button></Link>}
          />
        ) : loading ? (
          <StateView state="loading" title="Loading record details..." />
        ) : notFound ? (
          <StateView
            state="empty"
            title="Record not found"
            description={`No matching ${entity} record was found for ID #${id}.`}
            action={<Link to={entityMeta.backPath}><Button variant="outline" size="sm">{entityMeta.backLabel}</Button></Link>}
          />
        ) : error ? (
          <StateView
            state="error"
            title="Unable to load record"
            description={error}
            action={<Button variant="primary" size="sm" onClick={loadRecord}>Retry</Button>}
          />
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {actionError && (
              <div role="alert" className="admin-error-banner">
                {actionError}
              </div>
            )}
            {actionNotice && (
              <div role="status" className="admin-notice-banner">
                {actionNotice}
              </div>
            )}

            <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>{record.title}</h2>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    {record.subtitle}
                  </p>
                </div>
                <StatusBadge status={record.status} />
              </div>

              {actions.length > 0 && (
                <div className="admin-action-row" style={{ marginTop: 14 }}>
                  {actions.map((action) => (
                    <Button
                      key={action.key}
                      variant={action.nextStatus === 'active' ? 'primary' : 'outline'}
                      size="sm"
                      disabled={savingAction}
                      onClick={() => {
                        setActionError('');
                        setActionNotice('');
                        setPendingAction(action);
                      }}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-primary)' }}>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)', margin: 0 }}>
                {record.fields.map((field) => (
                  <div key={field.label}>
                    <dt style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>{field.label}</dt>
                    <dd style={{ margin: '2px 0 0', fontWeight: 500, overflowWrap: 'anywhere' }}>{field.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={Boolean(pendingAction)}
          title={pendingAction?.label || 'Confirm action'}
          description={`Confirm ${pendingAction?.label?.toLowerCase() || 'this action'} for ${record?.title || 'this record'}?`}
          confirmLabel={savingAction ? 'Saving...' : 'Confirm'}
          requireReason={Boolean(pendingAction?.requiresReason)}
          onCancel={() => {
            if (!savingAction) setPendingAction(null);
          }}
          onConfirm={handleConfirmAction}
        />
      </section>
    </AdminLayout>
  );
}
