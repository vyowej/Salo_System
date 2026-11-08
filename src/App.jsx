import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/common/ErrorBoundary';
import RequireAccess from './routes/RequireAccess';
import { RestaurantAccessProvider } from './features/restaurant/access/RestaurantAccessContext.jsx';

// ── Lazy-Loaded Pages for Code-Splitting ─────────────────────────

// Public & Marketing (Phase 2)
const LandingPage = lazy(() => import('./features/public/pages/LandingPage'));
const ForgotPasswordPage = lazy(() => import('./features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./features/auth/pages/ResetPasswordPage'));

// Customer Module (Phase 3)
const CustomerDashboard = lazy(() => import('./features/customer/pages/CustomerDashboard'));
const RestaurantDetailPage = lazy(() => import('./features/customer/pages/RestaurantDetailPage'));
const CartPage = lazy(() => import('./features/customer/pages/CartPage'));
const CheckoutPage = lazy(() => import('./features/customer/pages/CheckoutPage'));
const OrdersPage = lazy(() => import('./features/customer/pages/OrdersPage'));
const OrderDetailPage = lazy(() => import('./features/customer/pages/OrderDetailPage'));
const FavoritesPage = lazy(() => import('./features/customer/pages/FavoritesPage'));
const NotificationsPage = lazy(() => import('./features/customer/pages/NotificationsPage'));
const ReservationsPage = lazy(() => import('./features/customer/pages/ReservationsPage'));
const AddressesPage = lazy(() => import('./features/customer/pages/AddressesPage'));
const ProfilePage = lazy(() => import('./features/customer/pages/ProfilePage'));
const PartnerApplicationPage = lazy(() => import('./features/customer/pages/PartnerApplicationPage'));

// Owner Module (Phase 4)
const OwnerDashboard = lazy(() => import('./features/restaurant/pages/OwnerDashboard'));
const OwnerOrdersPage = lazy(() => import('./features/restaurant/pages/OwnerOrdersPage'));
const OwnerMenuPage = lazy(() => import('./features/restaurant/pages/OwnerMenuPage'));
const OwnerReservationsPage = lazy(() => import('./features/restaurant/pages/OwnerReservationsPage'));
const OwnerEarningsPage = lazy(() => import('./features/restaurant/pages/OwnerEarningsPage'));
const OwnerProfilePage = lazy(() => import('./features/restaurant/pages/OwnerProfilePage'));
const OwnerNotAvailablePage = lazy(() => import('./features/restaurant/pages/OwnerNotAvailablePage'));
const OwnerTablesPage = lazy(() => import('./features/restaurant/pages/OwnerTablesPage'));
const OwnerInventoryPage = lazy(() => import('./features/restaurant/pages/OwnerInventoryPage'));

// Rider Module (Phase 5)
const RiderDashboard = lazy(() => import('./features/rider/pages/RiderDashboard'));
const RiderActiveDeliveryPage = lazy(() => import('./features/rider/pages/RiderActiveDeliveryPage'));
const RiderJobsPage = lazy(() => import('./features/rider/pages/RiderJobsPage'));
const RiderHistoryPage = lazy(() => import('./features/rider/pages/RiderHistoryPage'));
const RiderEarningsPage = lazy(() => import('./features/rider/pages/RiderEarningsPage'));
const RiderProfilePage = lazy(() => import('./features/rider/pages/RiderProfilePage'));

// Admin Module (Phase 6)
const AdminDashboard = lazy(() => import('./features/admin/pages/AdminDashboard'));
const AdminRestaurantsPage = lazy(() => import('./features/admin/pages/AdminRestaurantsPage'));
const AdminRidersPage = lazy(() => import('./features/admin/pages/AdminRidersPage'));
const AdminOrdersPage = lazy(() => import('./features/admin/pages/AdminOrdersPage'));
const AdminUsersPage = lazy(() => import('./features/admin/pages/AdminUsersPage'));
const AdminSettingsPage = lazy(() => import('./features/admin/pages/AdminSettingsPage'));

// ── Lightweight Suspense Loading Screen ──────────────────────────
function PageLoader() {
  return (
    <div style={{
      minHeight: '60dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    }}>
      <div style={{
        width: 36,
        height: 36,
        border: '3px solid var(--border-secondary, #EAEAEA)',
        borderTopColor: 'var(--accent, #F36B2B)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <span style={{ fontSize: 12, color: 'var(--text-muted, #737373)', fontWeight: 600 }}>
        Loading SALO...
      </span>
    </div>
  );
}

/**
 * SALO Master Route Map
 * Code-split with React.lazy(), wrapped in ErrorBoundary and Suspense fallback.
 */
function AppShell() {
  const location = useLocation();

  useEffect(() => {
    const routeMeta = {
      '/': {
        title: 'SALO — Order. Reserve. Gather.',
        description: 'Modern Filipino food ordering, reservations, and restaurant discovery.',
      },
      '/login': {
        title: 'Login | SALO',
        description: 'Sign in to your SALO account and continue ordering, booking, and tracking.',
      },
      '/register': {
        title: 'Create an account | SALO',
        description: 'Join SALO to order food, reserve tables, and manage restaurant experiences.',
      },
      '/forgot-password': {
        title: 'Reset your password | SALO',
        description: 'Recover your SALO password securely and get back to ordering.',
      },
      '/customer': {
        title: 'Explore & Feed | SALO Customer',
        description: 'Discover restaurants, browse menus, and place delivery orders in one checkout.',
      },
      '/customer/cart': {
        title: 'Multi-Cart | SALO Customer',
        description: 'Review grouped restaurant orders and complete checkout with flexible delivery options.',
      },
      '/customer/orders': {
        title: 'My Orders | SALO Customer',
        description: 'Track active deliveries, check order status, and review recent purchases.',
      },
      '/customer/favorites': {
        title: 'My Favorites | SALO Customer',
        description: 'Revisit your saved restaurants and favorite food spots.',
      },
      '/customer/notifications': {
        title: 'Notifications | SALO Customer',
        description: 'Stay updated on your order, reservation, and promo activity.',
      },
      '/customer/reservations': {
        title: 'Reservations | SALO Customer',
        description: 'Manage table bookings, dining plans, and reservation details.',
      },
      '/customer/addresses': {
        title: 'Saved Addresses | SALO Customer',
        description: 'Manage your home, office, and delivery locations for faster ordering.',
      },
      '/customer/profile': {
        title: 'Profile & Settings | SALO Customer',
        description: 'Update your account details, preferences, and delivery profile.',
      },
      '/customer/partner': {
        title: 'Become a Partner | SALO',
        description: 'Apply to grow your restaurant or food business with SALO.',
      },
      '/owner': {
        title: 'Restaurant Dashboard | SALO Owner',
        description: 'Manage orders, menus, reservations, and store performance from one dashboard.',
      },
      '/owner/profile': { title: 'Business Profile | SALO Owner', description: 'Manage restaurant profile information.' },
      '/owner/menu': { title: 'Menu Management | SALO Owner', description: 'Manage restaurant menu information.' },
      '/owner/orders': { title: 'Orders | SALO Owner', description: 'Review restaurant orders.' },
      '/owner/reservations': { title: 'Reservations | SALO Owner', description: 'Review restaurant reservations.' },
      '/owner/tables': { title: 'Tables | SALO Owner', description: 'Restaurant table management.' },
      '/owner/inventory': { title: 'Inventory | SALO Owner', description: 'Restaurant inventory management.' },
      '/owner/promotions': { title: 'Promotions | SALO Owner', description: 'Restaurant promotions.' },
      '/owner/team': { title: 'Team and Staff | SALO Owner', description: 'Restaurant team access.' },
      '/owner/reports': { title: 'Reports and Statistics | SALO Owner', description: 'Restaurant reports and earnings.' },
      '/owner/activity': { title: 'Activity Logs | SALO Owner', description: 'Restaurant activity history.' },
      '/owner/settings': { title: 'Settings | SALO Owner', description: 'Restaurant settings.' },
      '/rider': {
        title: 'Rider Dashboard | SALO',
        description: 'Track deliveries, accept jobs, and view active order routes.',
      },
      '/admin': {
        title: 'Admin Dashboard | SALO',
        description: 'Monitor platform performance, partners, riders, and operational insights.',
      },
    };

    const pathname = location.pathname;
    const match = Object.keys(routeMeta)
      .filter((key) => key !== '/' && pathname.startsWith(key))
      .sort((a, b) => b.length - a.length)[0];
    const page = routeMeta[match] || routeMeta[pathname] || routeMeta['/'];

    document.title = page.title;

    let meta = document.head.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = page.description;
  }, [location.pathname]);

  return (
    <Routes>
          {/* ── Public & Marketing (Phase 2) ── */}
          <Route path="/" element={<LandingPage />} />

          {/* ── Authentication Flows (Phase 2) ── */}
          <Route path="/login" element={<LandingPage />} />
          <Route path="/register" element={<LandingPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* ── Customer Module (Phase 3) ── */}
          <Route path="/customer" element={<CustomerDashboard />} />
          <Route path="/customer/restaurants" element={<CustomerDashboard />} />
          <Route path="/customer/restaurants/:id" element={<RestaurantDetailPage />} />
          <Route path="/customer/cart" element={<CartPage />} />
          <Route path="/customer/checkout" element={<CheckoutPage />} />
          <Route path="/customer/orders" element={<OrdersPage />} />
          <Route path="/customer/orders/:id" element={<OrderDetailPage />} />
          <Route path="/customer/favorites" element={<FavoritesPage />} />
          <Route path="/customer/notifications" element={<NotificationsPage />} />
          <Route path="/customer/reservations" element={<ReservationsPage />} />
          <Route path="/customer/addresses" element={<AddressesPage />} />
          <Route path="/customer/profile" element={<ProfilePage />} />
          <Route path="/customer/partner" element={<PartnerApplicationPage />} />
          <Route path="/partner" element={<PartnerApplicationPage />} />

          {/* ── Owner Module: every destination checks restaurant membership and permissions ── */}
          <Route path="/owner" element={<RestaurantAccessProvider><Outlet /></RestaurantAccessProvider>}>
            <Route index element={<RequireAccess itemId="overview"><OwnerDashboard /></RequireAccess>} />
            <Route path="profile" element={<RequireAccess itemId="profile"><OwnerProfilePage /></RequireAccess>} />
            <Route path="menu" element={<RequireAccess itemId="menu"><OwnerMenuPage /></RequireAccess>} />
            <Route path="orders" element={<RequireAccess itemId="orders"><OwnerOrdersPage /></RequireAccess>} />
            <Route path="reservations" element={<RequireAccess itemId="reservations"><OwnerReservationsPage /></RequireAccess>} />
            <Route path="tables" element={<RequireAccess itemId="tables"><OwnerTablesPage /></RequireAccess>} />
            <Route path="inventory" element={<RequireAccess itemId="inventory"><OwnerInventoryPage /></RequireAccess>} />
            <Route path="promotions" element={<RequireAccess itemId="promotions"><OwnerNotAvailablePage title="Promotions" /></RequireAccess>} />
            <Route path="team" element={<RequireAccess itemId="team"><OwnerNotAvailablePage title="Team and Staff" /></RequireAccess>} />
            <Route path="reports" element={<RequireAccess itemId="reports"><OwnerEarningsPage /></RequireAccess>} />
            <Route path="activity" element={<RequireAccess itemId="activity"><OwnerNotAvailablePage title="Activity Logs" /></RequireAccess>} />
            <Route path="settings" element={<RequireAccess itemId="settings"><OwnerNotAvailablePage title="Settings" /></RequireAccess>} />
            <Route path="earnings" element={<RequireAccess itemId="reports"><Navigate to="/owner/reports" replace /></RequireAccess>} />
            <Route path="*" element={<RequireAccess><Navigate to="/owner" replace /></RequireAccess>} />
          </Route>

          {/* ── Rider Module (Phase 5) ── */}
          <Route path="/rider" element={<RiderDashboard />} />
          <Route path="/rider/active" element={<RiderActiveDeliveryPage />} />
          <Route path="/rider/jobs" element={<RiderJobsPage />} />
          <Route path="/rider/history" element={<RiderHistoryPage />} />
          <Route path="/rider/earnings" element={<RiderEarningsPage />} />
          <Route path="/rider/profile" element={<RiderProfilePage />} />

          {/* ── Admin Module (Phase 6) ── */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/restaurants" element={<AdminRestaurantsPage />} />
          <Route path="/admin/riders" element={<AdminRidersPage />} />
          <Route path="/admin/orders" element={<AdminOrdersPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <AppShell />
      </Suspense>
    </ErrorBoundary>
  );
}
