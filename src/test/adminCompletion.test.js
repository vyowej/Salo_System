import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

test('Admin stubbed pages are wired to real adminApiService endpoints', () => {
  const adminFees = fs.readFileSync(path.join(root, 'src/features/admin/pages/AdminFeesPage.jsx'), 'utf8');
  assert.match(adminFees, /getFeesConfig/);
  assert.match(adminFees, /updateFeesConfig/);
  assert.doesNotMatch(adminFees, /not available yet/i);

  const adminReports = fs.readFileSync(path.join(root, 'src/features/admin/pages/AdminReportsPage.jsx'), 'utf8');
  assert.match(adminReports, /getReportsSummary/);
  assert.match(adminReports, /exportReportCsv/);
  assert.doesNotMatch(adminReports, /not available yet/i);

  const adminSupport = fs.readFileSync(path.join(root, 'src/features/admin/pages/AdminSupportPage.jsx'), 'utf8');
  assert.match(adminSupport, /getSupportOverview/);
  assert.match(adminSupport, /\/admin\/orders\/disputes/);
  assert.doesNotMatch(adminSupport, /not available yet/i);

  const adminAdmins = fs.readFileSync(path.join(root, 'src/features/admin/pages/AdminAdministratorsPage.jsx'), 'utf8');
  assert.match(adminAdmins, /getUsers\(\{ role: 'admin'/);
  assert.doesNotMatch(adminAdmins, /not available yet/i);

  const adminSecurity = fs.readFileSync(path.join(root, 'src/features/admin/pages/AdminSecuritySettingsPage.jsx'), 'utf8');
  assert.match(adminSecurity, /revokeOtherSessions/);

  const adminOrderDetail = fs.readFileSync(path.join(root, 'src/features/admin/pages/AdminOrderDetailPage.jsx'), 'utf8');
  assert.match(adminOrderDetail, /getOrderDetail/);
  assert.match(adminOrderDetail, /cancelOrder/);
  assert.doesNotMatch(adminOrderDetail, /not available yet/i);

  const adminSettings = fs.readFileSync(path.join(root, 'src/features/admin/pages/AdminSettingsPage.jsx'), 'utf8');
  assert.match(adminSettings, /No platform settings are configurable yet/);

  const cartContext = fs.readFileSync(path.join(root, 'src/contexts/CartContext.jsx'), 'utf8');
  assert.match(cartContext, /\/platform\/delivery-fee/);
});
