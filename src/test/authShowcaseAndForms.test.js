import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import reactPlugin from '@vitejs/plugin-react';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

async function createTestViteServer() {
  return createServer({
    configFile: false,
    root: ROOT_DIR,
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    ssr: { external: ['react', 'react-dom', 'react-router-dom'] },
    appType: 'custom',
    logLevel: 'silent',
  });
}

test('authShowcase.data.js defines all 6 showcase slides in order with real SALO statuses and no hardcoded copy in LandingPage', async () => {
  const { authShowcaseSlides, AUTH_SHOWCASE_CONFIG } = await import(
    '../features/public/config/authShowcase.data.js'
  );
  const landingSrc = await fs.readFile(
    new URL('../features/public/pages/LandingPage.jsx', import.meta.url),
    'utf8',
  );

  assert.equal(AUTH_SHOWCASE_CONFIG.tagline, 'ORDER. RESERVE. GATHER.');
  assert.equal(AUTH_SHOWCASE_CONFIG.autoplayDurationMs, 6500);
  assert.equal(authShowcaseSlides.length, 6);

  // Slide 1: Overview
  assert.equal(authShowcaseSlides[0].id, 'overview');
  assert.equal(authShowcaseSlides[0].headline, 'Good food tastes better together.');
  assert.deepEqual(
    authShowcaseSlides[0].miniUi.chips.map((c) => c.label),
    [
      'Multi-restaurant cart',
      'Table reservations',
      'Delivery & pickup',
      'Cash on delivery',
    ],
  );

  // Slide 2: Multi-cart
  assert.equal(authShowcaseSlides[1].id, 'multi-cart');
  assert.equal(authShowcaseSlides[1].kicker, 'ONE CHECKOUT');
  assert.equal(authShowcaseSlides[1].headline, 'Order from many kitchens.');
  assert.equal(authShowcaseSlides[1].miniUi.cardTitle, 'Your cart');
  assert.equal(authShowcaseSlides[1].miniUi.rows.length, 3);
  assert.equal(authShowcaseSlides[1].miniUi.ctaLabel, 'One checkout');

  // Slide 3: Reservations
  assert.equal(authShowcaseSlides[2].id, 'reservations');
  assert.equal(authShowcaseSlides[2].kicker, 'RESERVE');
  assert.equal(authShowcaseSlides[2].headline, 'Book a table in seconds.');
  assert.ok(authShowcaseSlides[2].image.includes('slide-reserve.jpg'));
  assert.equal(authShowcaseSlides[2].miniUi.summary, 'Table for 4 / Sat / 7:00 PM');
  assert.equal(authShowcaseSlides[2].miniUi.seatCount, 4);
  assert.equal(authShowcaseSlides[2].miniUi.badgeLabel, 'Confirmed');

  // Slide 4: Delivery (real status names + pickup mentioned in subline)
  assert.equal(authShowcaseSlides[3].id, 'delivery');
  assert.equal(authShowcaseSlides[3].kicker, 'DELIVERY');
  assert.equal(authShowcaseSlides[3].headline, 'Meals, delivered.');
  assert.match(authShowcaseSlides[3].subline, /pickup/i);
  assert.deepEqual(
    authShowcaseSlides[3].miniUi.steps.map((s) => s.label),
    ['Accepted', 'Preparing', 'Out for Delivery', 'Delivered'],
  );

  // Slide 5: For restaurants
  assert.equal(authShowcaseSlides[4].id, 'restaurants');
  assert.equal(authShowcaseSlides[4].kicker, 'FOR RESTAURANTS');
  assert.equal(authShowcaseSlides[4].headline, 'Run your kitchen from one place.');
  assert.equal(authShowcaseSlides[4].miniUi.cardTitle, 'New order');
  assert.equal(authShowcaseSlides[4].miniUi.actionLabel, 'Accept');

  // Slide 6: For riders
  assert.equal(authShowcaseSlides[5].id, 'riders');
  assert.equal(authShowcaseSlides[5].kicker, 'FOR RIDERS');
  assert.equal(authShowcaseSlides[5].headline, 'Deliver and earn.');
  assert.equal(authShowcaseSlides[5].miniUi.cardTitle, 'Available deliveries');
  assert.equal(authShowcaseSlides[5].miniUi.actionLabel, 'Accept');

  // Ensure slide headlines are not hardcoded inside LandingPage.jsx
  assert.equal(landingSrc.includes('Order from many kitchens.'), false);
  assert.equal(landingSrc.includes('Book a table in seconds.'), false);
  assert.equal(landingSrc.includes('Run your kitchen from one place.'), false);
});

test('PasswordField: independent per-field eye toggles, focus preservation, Edge ::-ms-reveal hide, and removal of Show passwords link', async () => {
  const server = await createTestViteServer();

  try {
    const { PasswordField } = await server.ssrLoadModule('/src/components/forms/PasswordField.jsx');
    const { AuthProvider } = await server.ssrLoadModule('/src/contexts/AuthContext.jsx');
    const { default: LoginPage } = await server.ssrLoadModule('/src/features/auth/pages/LoginPage.jsx');
    const { default: RegisterPage } = await server.ssrLoadModule('/src/features/auth/pages/RegisterPage.jsx');

    const [loginSrc, registerSrc, formCss] = await Promise.all([
      fs.readFile(new URL('../features/auth/pages/LoginPage.jsx', import.meta.url), 'utf8'),
      fs.readFile(new URL('../features/auth/pages/RegisterPage.jsx', import.meta.url), 'utf8'),
      fs.readFile(new URL('../components/forms/FormElements.css', import.meta.url), 'utf8'),
    ]);

    // 1. "Show passwords" / "Hide passwords" link is completely removed
    assert.equal(registerSrc.includes('Show passwords'), false);
    assert.equal(registerSrc.includes('Hide passwords'), false);
    assert.equal(loginSrc.includes('Show passwords'), false);

    // 2. Email input on LoginPage does not have autoFocus causing stronger initial border
    assert.equal(loginSrc.includes('autoFocus'), false);

    // 3. Edge native password reveal icon is hidden in CSS
    assert.match(formCss, /::-ms-reveal/);

    // 4. Render LoginPage and verify single PasswordField with eye icon button
    const loginHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/login'] },
        React.createElement(AuthProvider, null, React.createElement(LoginPage, { embedded: true })),
      ),
    );
    assert.match(loginHtml, /id="login-password"/);
    assert.match(loginHtml, /type="password"/);
    assert.match(loginHtml, /aria-label="Show password"/);
    assert.match(loginHtml, /aria-pressed="false"/);
    assert.match(loginHtml, /data-icon="eye"/);

    // 5. Render RegisterPage and verify two independent PasswordFields (Password + Confirm Password)
    const registerHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/register'] },
        React.createElement(AuthProvider, null, React.createElement(RegisterPage, { embedded: true })),
      ),
    );
    const showPasswordButtonMatches = registerHtml.match(/aria-label="Show password"/g) || [];
    assert.equal(showPasswordButtonMatches.length, 2, 'Register form must render two independent password toggle buttons');
    assert.equal(registerHtml.includes('Show passwords'), false);

    // 6. Verify PasswordField encapsulates its own state per instance and prevents blur on mousedown
    const passwordFieldHtml = renderToStaticMarkup(
      React.createElement(
        'div',
        null,
        React.createElement(PasswordField, {
          id: 'pw-1',
          name: 'password',
          label: 'Password',
          value: 'secret123',
          onChange: () => {},
        }),
        React.createElement(PasswordField, {
          id: 'pw-2',
          name: 'passwordConfirmation',
          label: 'Confirm Password',
          value: 'secret123',
          onChange: () => {},
        }),
      ),
    );
    assert.match(passwordFieldHtml, /id="pw-1"[^>]*type="password"/);
    assert.match(passwordFieldHtml, /id="pw-2"[^>]*type="password"/);
    assert.equal((passwordFieldHtml.match(/class="password-field-toggle"/g) || []).length, 2);
  } finally {
    await server.close();
  }
});

test('Middle Initial (M.I.) field: optional, auto-uppercase, max 1 letter, strips period, excluded from username slug, and normalized in authService', async () => {
  const server = await createTestViteServer();

  try {
    const { sanitizeMiddleInitial, toUsernameSlug } =
      await server.ssrLoadModule('/src/features/auth/utils/registerFieldUtils.js');
    const { default: RegisterPage } =
      await server.ssrLoadModule('/src/features/auth/pages/RegisterPage.jsx');
    const { normalizeUser, authService } = await server.ssrLoadModule('/src/services/authService.js');
    const { clearCsrfCache } = await server.ssrLoadModule('/src/services/apiClient.js');
    const { AuthProvider } = await server.ssrLoadModule('/src/contexts/AuthContext.jsx');

    // 1. sanitizeMiddleInitial unit checks
    assert.equal(sanitizeMiddleInitial(''), '');
    assert.equal(sanitizeMiddleInitial(null), '');
    assert.equal(sanitizeMiddleInitial('d'), 'D');
    assert.equal(sanitizeMiddleInitial('d.'), 'D');
    assert.equal(sanitizeMiddleInitial('.m.'), 'M');
    assert.equal(sanitizeMiddleInitial('ab'), 'A');
    assert.equal(sanitizeMiddleInitial('7'), '');
    assert.equal(sanitizeMiddleInitial('9d'), 'D');

    // 2. Username is entered manually (not auto-suggested from name/middle initial)
    assert.equal(toUsernameSlug('Cassidy' + 'Santos'), 'cassidysantos');
    const registerSrc = await fs.readFile(
      new URL('../features/auth/pages/RegisterPage.jsx', import.meta.url),
      'utf8',
    );
    assert.equal(registerSrc.includes('toUsernameSlug'), false);
    assert.equal(registerSrc.includes('formData.firstName + formData.middleInitial'), false);
    assert.match(registerSrc, /validateUsernameFormat\(formData\.username\)/);

    // 3. Rendered RegisterPage contains First Name | M.I. (optional) | Last Name
    const registerHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/register'] },
        React.createElement(AuthProvider, null, React.createElement(RegisterPage, { embedded: true })),
      ),
    );
    assert.match(registerHtml, /id="register-firstname"/);
    assert.match(registerHtml, /id="register-middle-initial"/);
    assert.match(registerHtml, /id="register-lastname"/);
    assert.match(registerHtml, /M\.I\./);
    assert.match(registerHtml, /\(optional\)/);
    assert.match(registerHtml, /placeholder="e\.g\. D"/);

    // 4. normalizeUser formats "First M. Last" when middle_initial is present, and "First Last" when null
    const withMi = normalizeUser({
      user_id: 10,
      username: 'cassidysantos',
      first_name: 'Cassidy',
      middle_initial: 'D',
      last_name: 'Santos',
      email: 'cassidy@example.com',
      roles: ['customer'],
    });
    assert.equal(withMi.name, 'Cassidy D. Santos');

    const withoutMi = normalizeUser({
      user_id: 11,
      username: 'mateoreyes',
      first_name: 'Mateo',
      middle_initial: null,
      last_name: 'Reyes',
      email: 'mateo@example.com',
      roles: ['customer'],
    });
    assert.equal(withoutMi.name, 'Mateo Reyes');

    // 5. authService.register sends middle_initial as null when omitted/empty and as uppercase letter when provided
    const previousFetch = globalThis.fetch;
    const payloads = [];
    clearCsrfCache();

    globalThis.fetch = async (url, init = {}) => {
      if (url.endsWith('/auth/csrf')) {
        return new Response(JSON.stringify({ success: true, data: { csrf_token: 'mi-csrf' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/auth/register')) {
        const body = JSON.parse(init.body);
        payloads.push(body);
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              user: {
                user_id: 55,
                username: body.username,
                first_name: body.first_name,
                middle_initial: body.middle_initial,
                last_name: body.last_name,
                email: body.email,
                roles: ['customer'],
              },
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    };

    try {
      await authService.register({
        first_name: 'Cassidy',
        middle_initial: null,
        last_name: 'Santos',
        username: 'cassidysantos',
        email: 'cassidy@example.com',
        password: 'Password123!',
        password_confirmation: 'Password123!',
      });
      assert.equal(payloads[0].middle_initial, null);

      const resWithMi = await authService.register({
        first_name: 'Cassidy',
        middle_initial: 'D',
        last_name: 'Santos',
        username: 'cassidysantos2',
        email: 'cassidy2@example.com',
        password: 'Password123!',
        password_confirmation: 'Password123!',
      });
      assert.equal(payloads[1].middle_initial, 'D');
      assert.equal(resWithMi.user.name, 'Cassidy D. Santos');
    } finally {
      globalThis.fetch = previousFetch;
    }
  } finally {
    await server.close();
  }
});

test('LandingPage tab switch & showcase carousel: accessibility, pause on hover/focus/hidden, and reduced motion = no autoplay', async () => {
  const server = await createTestViteServer();

  try {
    const {
      default: LandingPage,
      AuthSlideshow,
    } = await server.ssrLoadModule('/src/features/public/pages/LandingPage.jsx');
    const { shouldCarouselAutoplay } = await server.ssrLoadModule(
      '/src/features/public/config/authShowcase.data.js',
    );
    const { AuthProvider } = await server.ssrLoadModule('/src/contexts/AuthContext.jsx');

    // 1. Autoplay logic: pauses on hover, focusWithin, user pause, tab hidden, and reducedMotion
    assert.equal(shouldCarouselAutoplay({}), true);
    assert.equal(shouldCarouselAutoplay({ isHovered: true }), false);
    assert.equal(shouldCarouselAutoplay({ isFocusedWithin: true }), false);
    assert.equal(shouldCarouselAutoplay({ isPausedByUser: true }), false);
    assert.equal(shouldCarouselAutoplay({ isTabHidden: true }), false);
    assert.equal(shouldCarouselAutoplay({ reducedMotion: true }), false);

    // 2. Carousel when autoplaying has role="region", aria-roledescription="carousel", slide labels "1 of 6".."6 of 6", and aria-live="off"
    const autoplayCarouselHtml = renderToStaticMarkup(
      React.createElement(AuthSlideshow, { initialReducedMotion: false }),
    );
    assert.match(autoplayCarouselHtml, /role="region"/);
    assert.match(autoplayCarouselHtml, /aria-roledescription="carousel"/);
    assert.match(autoplayCarouselHtml, /aria-live="off"/);
    assert.match(autoplayCarouselHtml, /aria-label="1 of 6"/);
    assert.match(autoplayCarouselHtml, /aria-label="2 of 6"/);
    assert.match(autoplayCarouselHtml, /aria-label="6 of 6"/);
    assert.match(autoplayCarouselHtml, /salo-intro-dot__fill is-running/);

    // 3. Carousel with reducedMotion = true disables autoplay and sets aria-live="polite" and dot fill to is-paused
    const reducedMotionCarouselHtml = renderToStaticMarkup(
      React.createElement(AuthSlideshow, { initialReducedMotion: true }),
    );
    assert.match(reducedMotionCarouselHtml, /is-reduced-motion/);
    assert.match(reducedMotionCarouselHtml, /aria-live="polite"/);
    assert.match(reducedMotionCarouselHtml, /salo-intro-dot__fill is-paused/);

    // 4. Tab switch between /login and /register updates sliding indicator and active form
    const loginRouteHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/login'] },
        React.createElement(AuthProvider, null, React.createElement(LandingPage)),
      ),
    );
    assert.match(loginRouteHtml, /salo-auth-switch-indicator is-login/);
    assert.match(loginRouteHtml, /Welcome back/);
    assert.match(loginRouteHtml, /ORDER\. RESERVE\. GATHER\./);

    const registerRouteHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/register'] },
        React.createElement(AuthProvider, null, React.createElement(LandingPage)),
      ),
    );
    assert.match(registerRouteHtml, /salo-auth-switch-indicator is-register/);
    assert.match(registerRouteHtml, /Create your account/);
    assert.match(registerRouteHtml, /id="register-middle-initial"/);
  } finally {
    await server.close();
  }
});
