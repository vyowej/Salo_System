import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './features/public/pages/LandingPage';
import LoginPage from './features/auth/pages/LoginPage';
import RegisterPage from './features/auth/pages/RegisterPage';
import ForgotPasswordPage from './features/auth/pages/ForgotPasswordPage';
import ResetPasswordPage from './features/auth/pages/ResetPasswordPage';
import DesignShowcase from './features/showcase/DesignShowcase';

// Customer Module (Phase 3)
import CustomerDashboard from './features/customer/pages/CustomerDashboard';
import RestaurantDetailPage from './features/customer/pages/RestaurantDetailPage';
import CartPage from './features/customer/pages/CartPage';
import CheckoutPage from './features/customer/pages/CheckoutPage';
import OrdersPage from './features/customer/pages/OrdersPage';
import OrderDetailPage from './features/customer/pages/OrderDetailPage';
import ReservationsPage from './features/customer/pages/ReservationsPage';
import AddressesPage from './features/customer/pages/AddressesPage';
import ProfilePage from './features/customer/pages/ProfilePage';

// Owner Module (Phase 4)
import OwnerDashboard from './features/restaurant/pages/OwnerDashboard';
import OwnerOrdersPage from './features/restaurant/pages/OwnerOrdersPage';
import OwnerMenuPage from './features/restaurant/pages/OwnerMenuPage';
import OwnerReservationsPage from './features/restaurant/pages/OwnerReservationsPage';
import OwnerEarningsPage from './features/restaurant/pages/OwnerEarningsPage';
import OwnerProfilePage from './features/restaurant/pages/OwnerProfilePage';

/**
 * SALO App Routes
 * Phase 1: Design System Showcase (/showcase)
 * Phase 2: Public Landing Page (/) & Authentication Flows (/login, /register, etc.)
 * Phase 3: Customer Module (/customer/*)
 * Phase 4: Restaurant Owner Module (/owner/*)
 */
export default function App() {
  return (
    <Routes>
      {/* ── Public & Marketing (Phase 2) ── */}
      <Route path="/" element={<LandingPage />} />

      {/* ── Authentication Flows (Phase 2) ── */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
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
      <Route path="/customer/reservations" element={<ReservationsPage />} />
      <Route path="/customer/addresses" element={<AddressesPage />} />
      <Route path="/customer/profile" element={<ProfilePage />} />

      {/* ── Owner Module (Phase 4) ── */}
      <Route path="/owner" element={<OwnerDashboard />} />
      <Route path="/owner/orders" element={<OwnerOrdersPage />} />
      <Route path="/owner/menu" element={<OwnerMenuPage />} />
      <Route path="/owner/reservations" element={<OwnerReservationsPage />} />
      <Route path="/owner/earnings" element={<OwnerEarningsPage />} />
      <Route path="/owner/profile" element={<OwnerProfilePage />} />

      {/* ── Design System Showcase (Phase 1) ── */}
      <Route path="/showcase" element={<DesignShowcase />} />

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
