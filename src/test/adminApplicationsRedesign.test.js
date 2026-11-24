import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

async function withViteSsr(fn) {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

test('applicationDocuments helpers compute Needs action counts, filter buckets, and friendly labels', async () => {
  await withViteSsr(async (server) => {
    const mod = await server.ssrLoadModule('/src/features/admin/constants/applicationDocuments.js');

    assert.deepEqual(
      mod.APPLICATION_FILTER_TABS.map((t) => t.value),
      ['needs_action', 'waiting', 'approved', 'rejected', 'all'],
    );

    const sample = [
      { application_status: 'submitted' },
      { application_status: 'pending_review' },
      { application_status: 'under_review' },
      { application_status: 'resubmitted' },
      { application_status: 'additional_documents_required' },
      { application_status: 'approved' },
      { application_status: 'approved' },
      { application_status: 'rejected' },
    ];

    const counts = mod.countApplicationsByFilter(sample);
    assert.deepEqual(counts, {
      needs_action: 4,
      waiting: 1,
      approved: 2,
      rejected: 1,
      all: 8,
    });

    assert.equal(mod.matchesApplicationFilter('submitted', 'needs_action'), true);
    assert.equal(mod.matchesApplicationFilter('additional_documents_required', 'needs_action'), false);
    assert.equal(mod.matchesApplicationFilter('additional_documents_required', 'waiting'), true);
    assert.equal(mod.matchesApplicationFilter('approved', 'approved'), true);
    assert.equal(mod.matchesApplicationFilter('rejected', 'rejected'), true);

    assert.equal(mod.getDocumentLabel('bank_proof'), 'Bank Proof');
    assert.equal(mod.getDocumentLabel('proof_of_address'), 'Proof of Address');
    assert.equal(mod.getDocumentLabel('mayors_permit'), "Mayor's Permit");
    assert.equal(mod.getDocumentLabel('government_id'), 'Government ID');
    assert.equal(mod.getDocumentLabel('dti_certificate'), 'DTI Certificate');
    assert.equal(mod.getDocumentLabel('driver_license'), "Driver's License");

    const summary = mod.buildRejectedDocumentsSummary([
      { document_code: 'mayors_permit', review_note: 'Blurry' },
      { document_code: 'bank_proof', review_note: 'Expired: old statement' },
    ]);
    assert.ok(summary.includes("Mayor's Permit (Blurry)"));
    assert.ok(summary.includes('Bank Proof (Expired: old statement)'));
  });
});

test('DecisionPanel disables Approve until all documents are verified and shows read-only result when decided', async () => {
  await withViteSsr(async (server) => {
    const { default: DecisionPanel } = await server.ssrLoadModule(
      '/src/features/admin/components/applications/DecisionPanel.jsx',
    );

    const partialHtml = renderToStaticMarkup(
      React.createElement(DecisionPanel, {
        application: { application_status: 'under_review' },
        documents: [
          { document_id: 1, document_code: 'mayors_permit', document_status: 'verified' },
          { document_id: 2, document_code: 'bank_proof', document_status: 'pending' },
        ],
        canApprove: true,
      }),
    );

    assert.match(partialHtml, /1 of 2 documents verified/);
    assert.match(partialHtml, /<button[^>]*disabled=""[^>]*>Approve application<\/button>/);
    assert.match(partialHtml, /Verify all documents to approve\./);
    assert.match(partialHtml, /<button[^>]*disabled=""[^>]*title="Reject at least one document[^"]*"[^>]*>Request more info<\/button>/);

    const readyHtml = renderToStaticMarkup(
      React.createElement(DecisionPanel, {
        application: { application_status: 'under_review' },
        documents: [
          { document_id: 1, document_code: 'mayors_permit', document_status: 'verified' },
          { document_id: 2, document_code: 'bank_proof', document_status: 'verified' },
        ],
        canApprove: true,
      }),
    );
    assert.match(readyHtml, /2 of 2 documents verified/);
    assert.doesNotMatch(readyHtml, /Verify all documents to approve\./);

    const rejectedDocHtml = renderToStaticMarkup(
      React.createElement(DecisionPanel, {
        application: { application_status: 'under_review' },
        documents: [
          { document_id: 1, document_code: 'mayors_permit', document_status: 'rejected', review_note: 'Blurry' },
        ],
        canApprove: true,
      }),
    );
    assert.doesNotMatch(rejectedDocHtml, /<button[^>]*disabled=""[^>]*>Request more info<\/button>/);

    const approvedHtml = renderToStaticMarkup(
      React.createElement(DecisionPanel, {
        application: {
          application_status: 'approved',
          decided_at: '2026-11-21T10:00:00Z',
          history: [{ action: 'restaurant_application_approved', actor: 'Admin User', created_at: '2026-11-21T10:00:00Z' }],
        },
        documents: [{ document_id: 1, document_code: 'mayors_permit', document_status: 'verified' }],
        canApprove: true,
      }),
    );
    assert.match(approvedHtml, /Approved by Admin User/);
    assert.doesNotMatch(approvedHtml, /Approve application/);
  });
});

test('DocumentCard hides raw filename, handles PDF card, and renders friendly labels and Verify/Reject buttons', async () => {
  await withViteSsr(async (server) => {
    const { default: DocumentCard } = await server.ssrLoadModule(
      '/src/features/admin/components/applications/DocumentCard.jsx',
    );

    const imgHtml = renderToStaticMarkup(
      React.createElement(DocumentCard, {
        doc: {
          document_id: 11,
          document_code: 'mayors_permit',
          original_filename: 'secret_raw_scan_9912.png',
          mime_type: 'image/png',
          file_url: '/api/applications/documents/11/file',
          document_status: 'pending',
        },
        canApprove: true,
      }),
    );
    assert.match(imgHtml, /Mayor&#x27;s Permit|Mayor's Permit/);
    assert.doesNotMatch(imgHtml, /secret_raw_scan_9912\.png/);
    assert.match(imgHtml, />Verify</);
    assert.match(imgHtml, />Reject</);

    const pdfHtml = renderToStaticMarkup(
      React.createElement(DocumentCard, {
        doc: {
          document_id: 12,
          document_code: 'dti_certificate',
          original_filename: 'dti.pdf',
          mime_type: 'application/pdf',
          file_url: '/api/applications/documents/12/file',
          document_status: 'verified',
        },
        canApprove: true,
      }),
    );
    assert.match(pdfHtml, /PDF Document/);
    assert.match(pdfHtml, />Open</);
  });
});

test('AdminApplicationsPage, DocumentCard, DocumentLightbox, and AdminTopbar implement required flows', async () => {
  const [pageSrc, cardSrc, lightboxSrc, topbarSrc] = await Promise.all([
    fs.readFile(fileURLToPath(new URL('../features/admin/pages/AdminApplicationsPage.jsx', import.meta.url)), 'utf8'),
    fs.readFile(fileURLToPath(new URL('../features/admin/components/applications/DocumentCard.jsx', import.meta.url)), 'utf8'),
    fs.readFile(fileURLToPath(new URL('../features/admin/components/applications/DocumentLightbox.jsx', import.meta.url)), 'utf8'),
    fs.readFile(fileURLToPath(new URL('../features/admin/components/AdminTopbar.jsx', import.meta.url)), 'utf8'),
  ]);

  // Default filter is needs_action and default perPage is 10
  assert.match(pageSrc, /useState\('needs_action'\)/);
  assert.match(pageSrc, /useState\(10\)/);
  // Row click opens ApplicationReviewDrawer
  assert.match(pageSrc, /onClick=\{\(\) => openApplicationDetail\(item\.kind, item\)\}/);
  assert.match(pageSrc, /<ApplicationReviewDrawer/);
  // Badge hidden when 0
  assert.match(pageSrc, /needsActionRestaurantCount > 0/);
  assert.match(pageSrc, /needsActionRiderCount > 0/);
  // Topbar Applications button removed
  assert.doesNotMatch(topbarSrc, /admin-topbar__apps-btn/);

  // Image error fallback + Retry
  assert.match(cardSrc, /Can&apos;t load file|Can't load file/);
  assert.match(cardSrc, /Retry/);
  assert.match(cardSrc, /DOCUMENT_REJECTION_REASONS/);

  // Lightbox keyboard navigation + Verify & Next
  assert.match(lightboxSrc, /event\.key === 'Escape'/);
  assert.match(lightboxSrc, /event\.key === 'ArrowLeft'/);
  assert.match(lightboxSrc, /event\.key === 'ArrowRight'/);
  assert.match(lightboxSrc, /onSelectIndex\?\.\(safeIndex \+ 1\)/);
});
