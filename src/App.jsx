import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/common/ErrorBoundary';
import RequireAccess from './routes/RequireAccess';
import { RestaurantAccessProvider } from './features/restaurant/access/RestaurantAccessContext.jsx';
import { AdminSessionProvider } from './features/admin/contexts/AdminSessionContext.jsx';
import { AdminNotificationsProvider } from './features/admin/contexts/AdminNotificationsContext.jsx';
import { AdminSearchProvider } from './features/admin/contexts/AdminSearchContext.jsx';

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
const InvitationsInboxPage = lazy(() => import('./features/customer/pages/InvitationsInboxPage'));
const BusinessApplicationPage = lazy(() => import('./pages/BusinessApplication/BusinessApplicationPage'));
const BusinessApplicationStatusPage = lazy(() => import('./pages/BusinessApplication/BusinessApplicationStatusPage'));
const RiderApplicationPage = lazy(() => import('./pages/RiderApplication/RiderApplicationPage'));
const RiderPartnerStatusPage = lazy(() => import('./pages/RiderApplication/RiderApplicationStatusPage'));

// Owner Module (Phase 4)
const OwnerDashboard = lazy(() => import('./features/restaurant/pages/OwnerDashboard'));
const OwnerOrdersPage = lazy(() => import('./features/restaurant/pages/OwnerOrdersPage'));
const OwnerMenuPage = lazy(() => import('./features/restaurant/pages/OwnerMenuPage'));
const OwnerReservationsPage = lazy(() => import('./features/restaurant/pages/OwnerReservationsPage'));
const OwnerPromotionsPage = lazy(() => import('./features/restaurant/pages/OwnerPromotionsPage'));
const OwnerReportsPage = lazy(() => import('./features/restaurant/pages/OwnerReportsPage'));
const OwnerActivityPage = lazy(() => import('./features/restaurant/pages/OwnerActivityPage'));
const OwnerSettingsPage = lazy(() => import('./features/restaurant/pages/OwnerSettingsPage'));
const OwnerProfilePage = lazy(() => import('./features/restaurant/pages/OwnerProfilePage'));
const OwnerTablesPage = lazy(() => import('./features/restaurant/pages/OwnerTablesPage'));
const OwnerInventoryPage = lazy(() => import('./features/restaurant/pages/OwnerInventoryPage'));
const TeamAndStaffPage = lazy(() => import('./features/restaurant/pages/TeamAndStaffPage'));

// Rider Module (Phase 5)
import RiderLayout from './layouts/RiderLayout';
const RiderDashboardPage = lazy(() => import('./features/rider/pages/RiderDashboardPage'));
const RiderDeliveriesPage = lazy(() => import('./features/rider/pages/RiderDeliveriesPage'));
const RiderActiveDeliveryPage = lazy(() => import('./features/rider/pages/RiderActiveDeliveryPage'));
const RiderMapPage = lazy(() => import('./features/rider/pages/RiderMapPage'));
const RiderEarningsPage = lazy(() => import('./features/rider/pages/RiderEarningsPage'));
const RiderActivationPage = lazy(() => import('./features/rider/pages/RiderActivationPage'));
const RiderAccountStatusPage = lazy(() => import('./features/rider/pages/RiderAccountStatusPage'));
const RiderGoOnlinePage = lazy(() => import('./features/rider/pages/RiderGoOnlinePage'));
const RiderSchedulePage = lazy(() => import('./features/rider/pages/RiderSchedulePage'));
const RiderHistoryPage = lazy(() => import('./features/rider/pages/RiderHistoryPage'));
const RiderNotificationsPage = lazy(() => import('./features/rider/pages/RiderNotificationsPage'));
const RiderSupportPage = lazy(() => import('./features/rider/pages/RiderSupportPage'));
const RiderProfilePage = lazy(() => import('./features/rider/pages/RiderProfilePage'));
const RiderSettingsPage = lazy(() => import('./features/rider/pages/RiderSettingsPage'));
const RiderSafetyPage = lazy(() => import('./features/rider/pages/RiderSafetyPage'));

// Admin Module (Phase 6)
const AdminDashboard = lazy(() => import('./features/admin/pages/AdminDashboard'));
const AdminRestaurantsPage = lazy(() => import('./features/admin/pages/AdminRestaurantsPage'));
const AdminRidersPage = lazy(() => import('./features/admin/pages/AdminRidersPage'));
const AdminOrdersPage = lazy(() => import('./features/admin/pages/AdminOrdersPage'));
const AdminOrderDetailPage = lazy(() => import('./features/admin/pages/AdminOrderDetailPage'));
const AdminReservationsPage = lazy(() => import('./features/admin/pages/AdminReservationsPage'));
const AdminDisputesPage = lazy(() => import('./features/admin/pages/AdminDisputesPage'));
const AdminUsersPage = lazy(() => import('./features/admin/pages/AdminUsersPage'));
const AdminServiceAreasPage = lazy(() => import('./features/admin/pages/AdminServiceAreasPage'));
const AdminSettingsPage = lazy(() => import('./features/admin/pages/AdminSettingsPage'));
const AdminSecuritySettingsPage = lazy(() => import('./features/admin/pages/AdminSecuritySettingsPage'));
const AdminApplicationsPage = lazy(() => import('./features/admin/pages/AdminApplicationsPage'));
const AdminAdministratorsPage = lazy(() => import('./features/admin/pages/AdminAdministratorsPage'));
const AdminFeesPage = lazy(() => import('./features/admin/pages/AdminFeesPage'));
const AdminFinancePage = lazy(() => import('./features/admin/pages/AdminFinancePage'));
const AdminActivityPage = lazy(() => import('./features/admin/pages/AdminActivityPage'));
const AdminContentPage = lazy(() => import('./features/admin/pages/AdminContentPage'));
const AdminDiscountsPage = lazy(() => import('./features/admin/pages/AdminDiscountsPage'));
const AdminReportsPage = lazy(() => import('./features/admin/pages/AdminReportsPage'));
const AdminSupportPage = lazy(() => import('./features/admin/pages/AdminSupportPage'));
const AdminRecordDetailPage = lazy(() => import('./features/admin/pages/AdminRecordDetailPage'));
const AdminRouteGuard = lazy(() => import('./features/admin/routes/AdminRouteGuard'));
const AdminPermissionRoute = lazy(() => import('./features/admin/routes/AdminPermissionRoute'));

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
      '/customer/invitations': {
        title: 'Invitations | SALO Customer',
        description: 'Review restaurant team and ownership invitations sent to your SALO account.',
      },
      '/customer/partner': {
        title: 'Become a Partner | SALO',
        description: 'Apply to grow your restaurant or food business with SALO.',
      },
      '/become-a-partner': {
        title: 'Restaurant Partner Application | SALO',
        description: 'Apply to become a verified restaurant partner on SALO.',
      },
      '/business-application/status': {
        title: 'Application Status | SALO Partner',
        description: 'Track your SALO restaurant partner application progress.',
      },
      '/become-a-rider': {
        title: 'Become a SALO Delivery Rider | SALO',
        description: 'Join the SALO delivery fleet with flexible shifts, transparent payouts, and verified safety.',
      },
      '/rider-application/status': {
        title: 'Rider Application Status | SALO',
        description: 'Track your SALO delivery rider application and onboarding progress.',
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
      '/rider/deliveries': {
        title: 'Delivery offers | SALO Rider',
        description: 'Review the latest rider delivery offers and active assignments.',
      },
      '/rider/deliveries/active': {
        title: 'Active delivery | SALO Rider',
        description: 'Track delivery progress, proof, and rider actions.',
      },
      '/rider/history': {
        title: 'Delivery history | SALO Rider',
        description: 'Review past deliveries, payment, and record details.',
      },
      '/rider/support': {
        title: 'Support & incidents | SALO Rider',
        description: 'Manage rider support tickets and safety escalations.',
      },
      '/rider/safety': {
        title: 'Safety & welfare | SALO Rider',
        description: 'Stay safe, follow guidance, and review emergency support contacts.',
      },
      '/rider/application': {
        title: 'Rider application | SALO',
        description: 'Apply to join the SALO rider network.',
      },
      '/rider/activate': {
        title: 'Activate your rider account | SALO',
        description: 'Complete rider activation and verification.',
      },
      '/rider/account-status': {
        title: 'Rider account status | SALO',
        description: 'Check your rider application and account state.',
      },
      '/admin': {
        title: 'Admin Dashboard | SALO',
        description: 'Monitor platform performance, partners, riders, and operational insights.',
      },
      '/admin/applications': {
        title: 'Applications | SALO Admin',
        description: 'Review pending restaurant and rider applications.',
      },
      '/admin/accounts': {
        title: 'Accounts | SALO Admin',
        description: 'Review account capabilities, statuses, and platform activity.',
      },
      '/admin/administrators': {
        title: 'Administrators | SALO Admin',
        description: 'Review administrator roles and invitation status.',
      },
      '/admin/restaurants': {
        title: 'Restaurants | SALO Admin',
        description: 'Manage restaurant partners and application status.',
      },
      '/admin/riders': {
        title: 'Riders | SALO Admin',
        description: 'Manage rider accounts, verification, and operations.',
      },
      '/admin/orders': {
        title: 'Orders | SALO Admin',
        description: 'Monitor platform orders and disputes.',
      },
      '/admin/reservations': {
        title: 'Reservations | SALO Admin',
        description: 'Monitor reservation activity and escalations.',
      },
      '/admin/finance': {
        title: 'Finance | SALO Admin',
        description: 'Review platform financial operations.',
      },
      '/admin/fees': {
        title: 'Fees and Commissions | SALO Admin',
        description: 'Configure fees and restaurant commissions.',
      },
      '/admin/discounts': {
        title: 'Discounts and Promotions | SALO Admin',
        description: 'Manage platform-wide discount campaigns.',
      },
      '/admin/service-areas': {
        title: 'Service Areas | SALO Admin',
        description: 'Manage supported cities, neighborhoods, and delivery zones.',
      },
      '/admin/reports': {
        title: 'Reports and Analytics | SALO Admin',
        description: 'Review platform and operational reports.',
      },
      '/admin/support': {
        title: 'Support and Complaints | SALO Admin',
        description: 'Review platform support requests and complaints.',
      },
      '/admin/content': {
        title: 'Content Management | SALO Admin',
        description: 'Manage platform content and featured collections.',
      },
      '/admin/activity': {
        title: 'Activity Logs | SALO Admin',
        description: 'Review platform audit records.',
      },
      '/admin/settings': {
        title: 'Settings | SALO Admin',
        description: 'Configure platform-wide settings and security.',
      },
      '/admin/settings/security': {
        title: 'Security and Sessions | SALO Admin',
        description: 'Review and revoke administrator sessions.',
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
          <Route path="/customer/invitations" element={<InvitationsInboxPage />} />
          <Route path="/customer/partner" element={<PartnerApplicationPage />} />
          <Route path="/partner" element={<PartnerApplicationPage />} />
          <Route path="/become-a-partner" element={<BusinessApplicationPage />} />
          <Route path="/business-application" element={<Navigate to="/become-a-partner" replace />} />
          <Route path="/business-application/status" element={<BusinessApplicationStatusPage />} />
          <Route path="/become-a-rider" element={<RiderApplicationPage />} />
          <Route path="/rider-application" element={<Navigate to="/become-a-rider" replace />} />
          <Route path="/rider-application/status" element={<RiderPartnerStatusPage />} />

          {/* ── Owner Module: every destination checks restaurant membership and permissions ── */}
          <Route path="/owner" element={<RestaurantAccessProvider><Outlet /></RestaurantAccessProvider>}>
            <Route index element={<RequireAccess itemId="overview"><OwnerDashboard /></RequireAccess>} />
            <Route path="profile" element={<RequireAccess itemId="profile"><OwnerProfilePage /></RequireAccess>} />
            <Route path="menu" element={<RequireAccess itemId="menu"><OwnerMenuPage /></RequireAccess>} />
            <Route path="orders" element={<RequireAccess itemId="orders"><OwnerOrdersPage /></RequireAccess>} />
            <Route path="reservations" element={<RequireAccess itemId="reservations"><OwnerReservationsPage /></RequireAccess>} />
            <Route path="tables" element={<RequireAccess itemId="tables"><OwnerTablesPage /></RequireAccess>} />
            <Route path="inventory" element={<RequireAccess itemId="inventory"><OwnerInventoryPage /></RequireAccess>} />
            <Route path="promotions" element={<RequireAccess itemId="promotions"><OwnerPromotionsPage /></RequireAccess>} />
            <Route path="team" element={<RequireAccess itemId="team"><TeamAndStaffPage /></RequireAccess>} />
            <Route path="reports" element={<RequireAccess itemId="reports"><OwnerReportsPage /></RequireAccess>} />
            <Route path="activity" element={<RequireAccess itemId="activity"><OwnerActivityPage /></RequireAccess>} />
            <Route path="settings" element={<RequireAccess itemId="settings"><OwnerSettingsPage /></RequireAccess>} />
            <Route path="earnings" element={<RequireAccess itemId="reports"><Navigate to="/owner/reports" replace /></RequireAccess>} />
            <Route path="*" element={<RequireAccess><Navigate to="/owner" replace /></RequireAccess>} />
          </Route>

          {/* ── Rider Module (Phase 5) ── */}
          <Route path="/rider" element={<RiderLayout><Outlet /></RiderLayout>}>
            <Route index element={<RiderDashboardPage />} />
            <Route path="jobs" element={<RiderDeliveriesPage />} />
            <Route path="deliveries" element={<RiderDeliveriesPage />} />
            <Route path="deliveries/active" element={<RiderActiveDeliveryPage />} />
            <Route path="active" element={<RiderActiveDeliveryPage />} />
            <Route path="map" element={<RiderMapPage />} />
            <Route path="schedule" element={<RiderSchedulePage />} />
            <Route path="earnings" element={<RiderEarningsPage />} />
            <Route path="history" element={<RiderHistoryPage />} />
            <Route path="history/:id" element={<RiderHistoryPage />} />
            <Route path="notifications" element={<RiderNotificationsPage />} />
            <Route path="support" element={<RiderSupportPage />} />
            <Route path="support/:id" element={<RiderSupportPage />} />
            <Route path="profile" element={<RiderProfilePage />} />
            <Route path="settings" element={<RiderSettingsPage />} />
            <Route path="safety" element={<RiderSafetyPage />} />
            <Route path="application" element={<RiderPartnerStatusPage />} />
            <Route path="application-form" element={<Navigate to="/become-a-rider" replace />} />
            <Route path="application/status" element={<RiderPartnerStatusPage />} />
            <Route path="go-online" element={<RiderGoOnlinePage />} />
            <Route path="account" element={<RiderAccountStatusPage />} />
            <Route path="activate" element={<RiderActivationPage />} />
            <Route path="account-status" element={<RiderAccountStatusPage />} />
          </Route>

          {/* ── Admin Module (Phase 6) ── */}
          <Route
            path="/admin"
            element={(
              <AdminSessionProvider>
                <AdminNotificationsProvider>
                  <AdminSearchProvider>
                    <AdminRouteGuard />
                  </AdminSearchProvider>
                </AdminNotificationsProvider>
              </AdminSessionProvider>
            )}
          >
            <Route index element={<AdminPermissionRoute module="dashboard" topic="dashboard"><AdminDashboard /></AdminPermissionRoute>} />
            <Route path="applications" element={<AdminPermissionRoute module="applications" topic="applications"><AdminApplicationsPage /></AdminPermissionRoute>} />
            <Route path="accounts" element={<AdminPermissionRoute module="accounts" topic="accounts"><AdminUsersPage /></AdminPermissionRoute>} />
            <Route path="users" element={<AdminPermissionRoute module="accounts" topic="accounts"><AdminUsersPage /></AdminPermissionRoute>} />
            <Route path="administrators" element={<AdminPermissionRoute module="administrators" topic="administrators"><AdminAdministratorsPage /></AdminPermissionRoute>} />
            <Route path="restaurants" element={<AdminPermissionRoute module="restaurants" topic="restaurants"><AdminRestaurantsPage /></AdminPermissionRoute>} />
            <Route path="riders" element={<AdminPermissionRoute module="riders" topic="riders"><AdminRidersPage /></AdminPermissionRoute>} />
            <Route path="orders" element={<AdminPermissionRoute module="orders" topic="orders"><AdminOrdersPage /></AdminPermissionRoute>} />
            <Route path="orders/disputes" element={<AdminPermissionRoute module="orders" topic="disputes"><AdminDisputesPage /></AdminPermissionRoute>} />
            <Route path="orders/disputes/:caseId" element={<AdminPermissionRoute module="orders" topic="disputes"><AdminDisputesPage /></AdminPermissionRoute>} />
            <Route path="orders/:id" element={<AdminPermissionRoute module="orders" topic="orders"><AdminOrderDetailPage /></AdminPermissionRoute>} />
            <Route path="reservations" element={<AdminPermissionRoute module="reservations" topic="reservations"><AdminReservationsPage /></AdminPermissionRoute>} />
            <Route path="reservations/:id" element={<AdminPermissionRoute module="reservations" topic="reservations"><AdminReservationsPage /></AdminPermissionRoute>} />
            <Route path="finance" element={<AdminPermissionRoute module="finance" topic="finance"><AdminFinancePage /></AdminPermissionRoute>} />
            <Route path="fees" element={<AdminPermissionRoute module="fees" topic="fees"><AdminFeesPage /></AdminPermissionRoute>} />
            <Route path="discounts" element={<AdminPermissionRoute module="discounts" topic="discounts"><AdminDiscountsPage /></AdminPermissionRoute>} />
            <Route path="service-areas" element={<AdminPermissionRoute module="serviceAreas" topic="serviceAreas"><AdminServiceAreasPage /></AdminPermissionRoute>} />
            <Route path="reports" element={<AdminPermissionRoute module="reports" topic="reports"><AdminReportsPage /></AdminPermissionRoute>} />
            <Route path="support" element={<AdminPermissionRoute module="support" topic="support"><AdminSupportPage /></AdminPermissionRoute>} />
            <Route path="content" element={<AdminPermissionRoute module="content" topic="content"><AdminContentPage /></AdminPermissionRoute>} />
            <Route path="activity" element={<AdminPermissionRoute module="activity" topic="activity"><AdminActivityPage /></AdminPermissionRoute>} />
            <Route path="settings" element={<AdminPermissionRoute module="settings" topic="settings"><AdminSettingsPage /></AdminPermissionRoute>} />
            <Route path="settings/security" element={<AdminPermissionRoute module="settings" topic="sessions"><AdminSecuritySettingsPage /></AdminPermissionRoute>} />
            <Route path="accounts/:id" element={<AdminPermissionRoute module="accounts" topic="accounts"><AdminRecordDetailPage entity="accounts" /></AdminPermissionRoute>} />
            <Route path="administrators/:id" element={<AdminPermissionRoute module="administrators" topic="administrators"><AdminRecordDetailPage entity="administrators" /></AdminPermissionRoute>} />
            <Route path="restaurants/:id" element={<AdminPermissionRoute module="restaurants" topic="restaurants"><AdminRecordDetailPage entity="restaurants" /></AdminPermissionRoute>} />
            <Route path="riders/:id" element={<AdminPermissionRoute module="riders" topic="riders"><AdminRecordDetailPage entity="riders" /></AdminPermissionRoute>} />
          </Route>

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
