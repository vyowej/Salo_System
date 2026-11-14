import { useState, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import { DOCUMENT_CATALOG } from '../../../pages/BusinessApplication/constants/documentRequirements';
import './AdminComponents.css';

export default function DocumentViewer({
  documents = [],
  subject,
  status = 'Pending',
  onUpdateDocumentStatus,
  onRequestAdditional,
}) {
  const [selectedDocId, setSelectedDocId] = useState('');
  const [rejectingDocId, setRejectingDocId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  // Normalize document entries
  const normalizedDocs = useMemo(() => {
    return documents.map((doc, idx) => {
      if (typeof doc === 'string') {
        const catalogMatch = Object.values(DOCUMENT_CATALOG).find(
          (c) => c.title.toLowerCase() === doc.toLowerCase() || c.id === doc
        );
        return {
          id: doc,
          name: catalogMatch ? catalogMatch.title : doc,
          title: catalogMatch ? catalogMatch.title : doc,
          category: catalogMatch ? catalogMatch.category : 'General Documents',
          classification: catalogMatch ? catalogMatch.classification : 'mandatory',
          whyNeeded: catalogMatch ? catalogMatch.whyNeeded : null,
          verificationStatus: status,
          rejectionReason: '',
        };
      }
      const catalogMatch = DOCUMENT_CATALOG[doc.id] || Object.values(DOCUMENT_CATALOG).find(
        (c) => c.title.toLowerCase() === (doc.name || '').toLowerCase()
      );
      return {
        id: doc.id || doc.name || `doc-${idx}`,
        name: doc.name || catalogMatch?.title || 'Document',
        title: catalogMatch?.title || doc.name || 'Document',
        category: doc.category || catalogMatch?.category || 'General Documents',
        classification: doc.classification || catalogMatch?.classification || 'mandatory',
        whyNeeded: doc.whyNeeded || catalogMatch?.whyNeeded || null,
        verificationStatus: doc.verificationStatus || status,
        rejectionReason: doc.rejectionReason || '',
        previewUrl: doc.previewUrl,
        size: doc.size,
        type: doc.type,
        uploadedAt: doc.uploadedAt,
      };
    });
  }, [documents, status]);

  // Group documents by classification
  const groups = useMemo(() => {
    const map = {
      mandatory: { title: 'Mandatory Documents', items: [] },
      conditional: { title: 'Conditional Documents', items: [] },
      supporting: { title: 'Additional Supporting Documents', items: [] },
      requested: { title: 'Requested Documents', items: [] },
    };

    normalizedDocs.forEach((doc) => {
      const cls = doc.classification || 'mandatory';
      if (map[cls]) {
        map[cls].items.push(doc);
      } else {
        map.mandatory.items.push(doc);
      }
    });

    return Object.entries(map).filter(([_, group]) => group.items.length > 0);
  }, [normalizedDocs]);

  if (!normalizedDocs.length) {
    return <p>No submitted documents are attached to this record.</p>;
  }

  const activeDoc = normalizedDocs.find((d) => d.id === selectedDocId) || normalizedDocs[0];

  const handleSetStatus = (newStatus) => {
    if (newStatus === 'Rejected') {
      setRejectingDocId(activeDoc.id);
      setRejectReason('');
      setRejectError('');
      return;
    }
    setRejectingDocId(null);
    onUpdateDocumentStatus?.(activeDoc.id, newStatus, '');
  };

  const handleConfirmReject = () => {
    if (!rejectReason.trim()) {
      setRejectError('Please enter a rejection reason.');
      return;
    }
    onUpdateDocumentStatus?.(activeDoc.id, 'Rejected', rejectReason.trim());
    setRejectingDocId(null);
    setRejectReason('');
    setRejectError('');
  };

  return (
    <section className="admin-document-viewer" aria-label={`${subject} submitted documents`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ margin: 0 }}>Submitted Documents</h3>
        {onRequestAdditional && (
          <button
            type="button"
            className="admin-action-button"
            onClick={onRequestAdditional}
            style={{ fontSize: '12px' }}
          >
            + Request Additional Documents
          </button>
        )}
      </div>

      <div className="admin-document-viewer__groups" role="group" aria-label="Select a document">
        {groups.map(([clsKey, group]) => (
          <div key={clsKey} className="admin-document-viewer__group" style={{ marginBottom: '12px' }}>
            <h4
              style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-secondary)',
                margin: '8px 0 4px',
              }}
            >
              {group.title}
            </h4>
            <div className="admin-document-viewer__list">
              {group.items.map((document) => {
                const isSelected = activeDoc.id === document.id;
                return (
                  <button
                    className="admin-document-viewer__item"
                    type="button"
                    key={document.id}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedDocId(document.id);
                      setRejectingDocId(null);
                    }}
                  >
                    <span aria-hidden="true">▤</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{document.name}</strong>
                      <small style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span>{document.category}</span>
                        <span>•</span>
                        <StatusBadge status={document.verificationStatus} />
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Preview Section */}
      <div className="admin-document-viewer__preview" role="region" aria-label={`${activeDoc.name} preview`} aria-live="polite">
        <span className="admin-document-viewer__icon" aria-hidden="true">▤</span>
        <strong>{activeDoc.name}</strong>
        <span>{subject}</span>

        {activeDoc.whyNeeded && (
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--surface-primary)', padding: '6px 10px', borderRadius: '4px', margin: '4px 0', borderLeft: '3px solid var(--salo-orange)' }}>
            <strong>Why SALO requires this:</strong> {activeDoc.whyNeeded}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Status:</span>
          <StatusBadge status={activeDoc.verificationStatus} />
        </div>

        {activeDoc.verificationStatus === 'Rejected' && activeDoc.rejectionReason && (
          <div
            role="alert"
            style={{
              fontSize: '12px',
              color: 'var(--salo-error, #b84040)',
              background: '#fef2f2',
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid #fecaca',
              margin: '4px 0',
              textAlign: 'left',
              width: '100%',
              maxWidth: '380px',
            }}
          >
            <strong>Rejection Reason:</strong> {activeDoc.rejectionReason}
          </div>
        )}

        {/* Admin Verification Controls */}
        {onUpdateDocumentStatus && (
          <div style={{ marginTop: '10px', width: '100%', maxWidth: '380px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Admin Verification Action:
            </span>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="admin-action-button"
                onClick={() => handleSetStatus('Verified')}
                style={{ fontSize: '11px', background: activeDoc.verificationStatus === 'Verified' ? 'var(--salo-green-light, #e6f4ea)' : undefined }}
              >
                ✓ Mark as Verified
              </button>
              <button
                type="button"
                className="admin-action-button"
                onClick={() => handleSetStatus('Pending Review')}
                style={{ fontSize: '11px' }}
              >
                Pending Review
              </button>
              <button
                type="button"
                className="admin-action-button admin-action-button--danger"
                onClick={() => handleSetStatus('Rejected')}
                style={{ fontSize: '11px' }}
              >
                ✕ Reject Document
              </button>
            </div>

            {rejectingDocId === activeDoc.id && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '10px',
                  background: 'var(--surface-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '6px',
                  textAlign: 'left',
                }}
              >
                <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Reason for rejection <span style={{ color: 'var(--salo-error)' }}>*</span>
                </label>
                <textarea
                  rows="2"
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    setRejectError('');
                  }}
                  placeholder="Specify why document is rejected (e.g. illegible, expired, mismatch)..."
                  style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-primary)', boxSizing: 'border-box' }}
                />
                {rejectError && <p style={{ color: 'var(--salo-error)', fontSize: '11px', margin: '4px 0 0' }}>{rejectError}</p>}
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="admin-action-button"
                    onClick={() => setRejectingDocId(null)}
                    style={{ fontSize: '11px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="admin-action-button admin-action-button--danger"
                    onClick={handleConfirmReject}
                    style={{ fontSize: '11px' }}
                  >
                    Confirm Rejection
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '8px 0 0', maxWidth: '380px' }}>
          Document preview placeholder.
        </p>
      </div>
    </section>
  );
}
