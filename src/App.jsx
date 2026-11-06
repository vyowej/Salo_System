import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/common/ErrorBoundary';

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

// Showcase (Phase 1 & 7)
const DesignShowcase = lazy(() => import('./features/showcase/DesignShowcase'));

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
export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
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

          {/* ── Owner Module (Phase 4) ── */}
          <Route path="/owner" element={<OwnerDashboard />} />
          <Route path="/owner/orders" element={<OwnerOrdersPage />} />
          <Route path="/owner/menu" element={<OwnerMenuPage />} />
          <Route path="/owner/reservations" element={<OwnerReservationsPage />} />
          <Route path="/owner/earnings" element={<OwnerEarningsPage />} />
          <Route path="/owner/profile" element={<OwnerProfilePage />} />

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

          {/* ── Design System Showcase (Phase 1 & 7) ── */}
          <Route path="/showcase" element={<DesignShowcase />} />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
