import { useState } from 'react';
import StatusBadge from './StatusBadge';
import './AdminComponents.css';

export default function DocumentViewer({ documents = [], subject, status = 'Pending' }) {
  const [selectedDocument, setSelectedDocument] = useState('');
  const activeDocument = documents.includes(selectedDocument) ? selectedDocument : documents[0];

  if (!documents.length) return <p>No submitted documents are attached to this demo record.</p>;

  return (
    <section className="admin-document-viewer" aria-label={`${subject} submitted documents`}>
      <h3>Submitted documents</h3>
      <div className="admin-document-viewer__list" role="group" aria-label="Select a document">
        {documents.map((document) => (
          <button
            className="admin-document-viewer__item"
            type="button"
            key={document}
            aria-pressed={activeDocument === document}
            onClick={() => setSelectedDocument(document)}
          >
            <span aria-hidden="true">▤</span>
            <span><strong>{document}</strong><small>Demo record · click to preview</small></span>
          </button>
        ))}
      </div>
      <div className="admin-document-viewer__preview" role="region" aria-label={`${activeDocument} preview`} aria-live="polite">
        <span className="admin-document-viewer__icon" aria-hidden="true">▤</span>
        <strong>{activeDocument}</strong>
        <span>{subject}</span>
        <p>Illustrative document preview. This demo record contains no original file or personal document image.</p>
        <StatusBadge status={status} />
      </div>
    </section>
  );
}
