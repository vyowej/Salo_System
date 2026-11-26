import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import reactPlugin from '@vitejs/plugin-react';

test('Phase 6: settingsConfig per-mode grouping, order, labels, and UnifiedSettingsShell mode headers', async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../', import.meta.url)),
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    ssr: { external: ['react', 'react-dom', 'react-router-dom', 'leaflet', 'react-leaflet'] },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { getSettingsSectionsForRole, SETTINGS_LABELS } = await server.ssrLoadModule(
      '/src/config/settingsConfig.js',
    );
    const { default: UnifiedSettingsShell } = await server.ssrLoadModule(
      '/src/components/settings/UnifiedSettingsShell.jsx',
    );

    assert.equal(SETTINGS_LABELS.switchAccountButton, 'Switch Mode');

    const roles = [
      { role: 'customer', group: 'Customer Settings', notifLabel: 'Customer Notifications', firstId: 'addresses' },
      { role: 'restaurant', group: 'Restaurant Settings', notifLabel: 'Restaurant Notifications', firstId: 'business' },
      { role: 'rider', group: 'Rider Settings', notifLabel: 'Rider Notifications', firstId: 'driver_mode' },
    ];

    for (const cfg of roles) {
      const sections = getSettingsSectionsForRole(cfg.role);
      const ids = sections.map((s) => s.id);

      assert.equal(sections[0].id, cfg.firstId);
      assert.equal(sections[0].group, cfg.group);
      assert.equal(sections[0].groupHint, 'Applies to this mode only');

      const notif = sections.find((s) => s.id === 'notifications');
      assert.equal(notif.group, cfg.group);
      assert.equal(notif.label, cfg.notifLabel);

      // Account (All Modes) group comes AFTER mode-specific settings
      const lastThree = sections.slice(-3);
      assert.deepEqual(lastThree.map((s) => s.id), ['account', 'security', 'preferences']);
      assert.deepEqual(lastThree.map((s) => s.label), ['Profile & Email', 'Password & Security', 'Display Preferences']);
      for (const item of lastThree) {
        assert.equal(item.group, 'Account (All Modes)');
        assert.equal(item.groupHint, 'Applies to all your SALO modes');
      }

      // No foreign sections
      if (cfg.role !== 'customer') {
        assert.equal(ids.includes('addresses'), false);
        assert.equal(ids.includes('contact_numbers'), false);
      }
      if (cfg.role !== 'restaurant') {
        assert.equal(ids.includes('business'), false);
        assert.equal(ids.includes('orders'), false);
      }
      if (cfg.role !== 'rider') {
        assert.equal(ids.includes('driver_mode'), false);
        assert.equal(ids.includes('location'), false);
      }
      assert.equal(ids.includes('terms'), false);

      // UnifiedSettingsShell renders mode title and group hints
      const html = renderToStaticMarkup(
        React.createElement(UnifiedSettingsShell, {
          eyebrow: `${cfg.role} Mode`,
          title: cfg.group,
          sections,
          activeSection: cfg.firstId,
          renderSection: () => React.createElement('div', null, 'Section body'),
        }),
      );
      assert.match(html, new RegExp(cfg.group));
      assert.match(html, /Applies to this mode only/);
      assert.match(html, /Applies to all your SALO modes/);
      assert.match(html, /Account \(All Modes\)/);
    }

    // Verify each Settings page sets clear mode title and defaults to first mode section
    const [custSrc, ownerSrc, riderSrc] = await Promise.all([
      fs.readFile(new URL('../features/customer/pages/CustomerSettingsPage.jsx', import.meta.url), 'utf8'),
      fs.readFile(new URL('../features/restaurant/pages/OwnerSettingsPage.jsx', import.meta.url), 'utf8'),
      fs.readFile(new URL('../features/rider/pages/RiderSettingsPage.jsx', import.meta.url), 'utf8'),
    ]);

    assert.match(custSrc, /title="Customer Settings"/);
    assert.match(ownerSrc, /title="Restaurant Settings"/);
    assert.match(riderSrc, /title="Rider Settings"/);
  } finally {
    await server.close();
  }
});
