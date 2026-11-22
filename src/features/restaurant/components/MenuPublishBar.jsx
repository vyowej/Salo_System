import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import './MenuPublishBar.css';

export function getPublishBadgeMeta(publishStatus) {
  if (!publishStatus) {
    return { tone: 'neutral', label: 'Not published' };
  }
  const pendingTotal = Number(publishStatus.pending_changes?.total ?? 0);
  if (!publishStatus.is_published) {
    return { tone: 'neutral', label: 'Not published' };
  }
  if (pendingTotal > 0 || publishStatus.has_unpublished_changes) {
    return { tone: 'warning', label: `Unpublished changes · ${pendingTotal}` };
  }
  return { tone: 'success', label: 'Published' };
}

export default function MenuPublishBar({
  publishStatus,
  canPublish = false,
  busy = false,
  onPublish,
  onUnpublish,
  onDiscard,
  onPreview,
}) {
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [unpublishModalOpen, setUnpublishModalOpen] = useState(false);
  const [discardModalOpen, setDiscardModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [unpublishReason, setUnpublishReason] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  if (!publishStatus) return null;

  const badge = getPublishBadgeMeta(publishStatus);
  const pending = publishStatus.pending_changes || { total: 0, new: 0, modified: 0, pending_delete: 0 };
  const blockers = Array.isArray(publishStatus.blockers) ? publishStatus.blockers : [];
  const warnings = Array.isArray(publishStatus.warnings) ? publishStatus.warnings : [];

  async function handleOpenPreview() {
    setActionError('');
    setPreviewModalOpen(true);
    if (!onPreview) return;
    setPreviewLoading(true);
    try {
      const data = await onPreview();
      setPreviewData(data);
    } catch (err) {
      setActionError(err?.message || 'Unable to load menu preview.');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleConfirmPublish() {
    setActionError('');
    try {
      await onPublish?.();
      setPublishModalOpen(false);
    } catch (err) {
      setActionError(err?.message || 'Unable to publish menu.');
    }
  }

  async function handleConfirmUnpublish() {
    setActionError('');
    try {
      await onUnpublish?.(unpublishReason.trim());
      setUnpublishReason('');
      setUnpublishModalOpen(false);
    } catch (err) {
      setActionError(err?.message || 'Unable to unpublish restaurant.');
    }
  }

  async function handleConfirmDiscard() {
    setActionError('');
    try {
      await onDiscard?.();
      setDiscardModalOpen(false);
    } catch (err) {
      setActionError(err?.message || 'Unable to discard draft changes.');
    }
  }

  return (
    <>
      <section className="salo-menu-publish-bar" aria-label="Menu publishing status">
        <div className="salo-menu-publish-bar__info">
          <div className="salo-menu-publish-bar__title-row">
            <span className={`salo-publish-badge salo-publish-badge--${badge.tone}`}>
              {badge.label}
            </span>
            {publishStatus.last_published_at ? (
              <span className="salo-menu-publish-bar__meta">
                Last published {new Date(publishStatus.last_published_at).toLocaleString()}
              </span>
            ) : (
              <span className="salo-menu-publish-bar__meta">
                Hidden from customers until published
              </span>
            )}
          </div>
          <p className="salo-menu-publish-bar__subtitle">
            {pending.total > 0
              ? `You have ${pending.total} unpublished menu change${pending.total === 1 ? '' : 's'} (${pending.new} new, ${pending.modified} edited, ${pending.pending_delete} removed). Customers still see your ${publishStatus.is_published ? 'previous live menu' : 'storefront only after you publish'}.`
              : publishStatus.is_published
                ? 'Your live customer menu is up to date. Availability toggles (Available / Sold out / Hidden) apply immediately.'
                : 'Build your categories and dishes as drafts, preview how customers will see them, then click Publish to go live.'}
          </p>
          {blockers.length > 0 && !publishStatus.is_published && (
            <div className="salo-publish-alert salo-publish-alert--error" role="status" style={{ marginTop: 8 }}>
              <strong>Before publishing:</strong> {blockers.join(' ')}
              {blockers.some((b) => /delivery service area/i.test(String(b))) && (
                <>
                  {' '}
                  <Link to="/owner/profile" style={{ fontWeight: 700, textDecoration: 'underline' }}>
                    Set delivery coverage
                  </Link>
                </>
              )}
            </div>
          )}
        </div>

        <div className="salo-menu-publish-bar__actions">
          {canPublish ? (
            <>
              <Button variant="secondary" size="sm" onClick={handleOpenPreview} disabled={busy}>
                Preview
              </Button>
              {pending.total > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => { setActionError(''); setDiscardModalOpen(true); }} disabled={busy}>
                  Discard changes
                </Button>
              ) : null}
              {publishStatus.is_published ? (
                <Button variant="secondary" size="sm" onClick={() => { setActionError(''); setUnpublishModalOpen(true); }} disabled={busy}>
                  Unpublish
                </Button>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                onClick={() => { setActionError(''); setPublishModalOpen(true); }}
                disabled={busy}
              >
                {publishStatus.is_published ? 'Publish changes' : 'Publish restaurant'}
              </Button>
            </>
          ) : null}
        </div>
      </section>

      <Modal
        open={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        title={publishStatus.is_published ? 'Publish menu changes' : 'Publish restaurant & menu'}
        description="Customers will immediately see the updated menu after publishing."
        size="md"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setPublishModalOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleConfirmPublish}
              loading={busy}
              disabled={busy || blockers.length > 0}
            >
              Confirm publish
            </Button>
          </>
        )}
      >
        <div className="salo-publish-modal-body">
          {actionError ? <div className="salo-publish-alert salo-publish-alert--error">{actionError}</div> : null}

          {blockers.length > 0 ? (
            <div className="salo-publish-alert salo-publish-alert--error">
              <strong>Complete these requirements before publishing:</strong>
              <ul>
                {blockers.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div className="salo-publish-alert salo-publish-alert--warning">
              <strong>Recommendations:</strong>
              <ul>
                {warnings.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="salo-publish-summary-grid">
            <div><span>New</span><strong>{pending.new}</strong></div>
            <div><span>Edited</span><strong>{pending.modified}</strong></div>
            <div><span>Removed</span><strong>{pending.pending_delete}</strong></div>
          </div>
        </div>
      </Modal>

      <Modal
        open={unpublishModalOpen}
        onClose={() => setUnpublishModalOpen(false)}
        title="Unpublish restaurant?"
        description="Your restaurant and menu will be hidden from customers immediately. Existing orders remain active in your workspace."
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setUnpublishModalOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="danger" onClick={handleConfirmUnpublish} loading={busy}>Unpublish</Button>
          </>
        )}
      >
        <div className="salo-publish-modal-body">
          {actionError ? <div className="salo-publish-alert salo-publish-alert--error">{actionError}</div> : null}
          <label className="salo-publish-reason-field">
            <span>Reason (optional, saved in audit log)</span>
            <input
              type="text"
              value={unpublishReason}
              onChange={(e) => setUnpublishReason(e.target.value)}
              placeholder="e.g. Seasonal menu overhaul"
              maxLength={255}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={discardModalOpen}
        onClose={() => setDiscardModalOpen(false)}
        title="Discard unpublished changes?"
        description="All new drafts will be deleted and edited or removed items will revert to the last published menu."
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDiscardModalOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="danger" onClick={handleConfirmDiscard} loading={busy}>Discard changes</Button>
          </>
        )}
      >
        {actionError ? <div className="salo-publish-alert salo-publish-alert--error">{actionError}</div> : null}
      </Modal>

      <Modal
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title="Customer menu preview (draft)"
        description="This is how your menu will look to customers once published."
        size="lg"
        footer={<Button variant="secondary" onClick={() => setPreviewModalOpen(false)}>Close</Button>}
      >
        {previewLoading ? (
          <p className="salo-publish-preview-empty">Loading preview...</p>
        ) : actionError ? (
          <div className="salo-publish-alert salo-publish-alert--error">{actionError}</div>
        ) : !previewData?.categories?.length ? (
          <p className="salo-publish-preview-empty">No active categories or visible items in your draft menu yet.</p>
        ) : (
          <div className="salo-publish-preview-list">
            {previewData.categories.map((cat) => (
              <div key={cat.id} className="salo-publish-preview-cat">
                <h4>{cat.name}</h4>
                {cat.items?.length ? (
                  <ul>
                    {cat.items.map((item) => (
                      <li key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          {item.description ? <p>{item.description}</p> : null}
                        </div>
                        <div className="salo-publish-preview-price">
                          <span>₱{Number(item.price || 0).toFixed(2)}</span>
                          <small>{item.availability}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="salo-publish-preview-empty">No visible items in this category.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
