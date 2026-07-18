import { Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import AuthLayout from "../layouts/AuthLayout";
import DashboardLayout from "../layouts/DashboardLayout";
import MainLayout from "../layouts/MainLayout";
import AdminDashboardPage from "../pages/AdminDashboardPage";
import AdminBookingsPage from "../pages/AdminBookingsPage";
import AdminReportedVendorsPage from "../pages/AdminReportedVendorsPage";
import AdminReviewsPage from "../pages/AdminReviewsPage";
import AdminVerifyVendorsPage from "../pages/AdminVerifyVendorsPage";
import BookingRequestPage from "../pages/BookingRequestPage";
import CustomerDashboardPage from "../pages/CustomerDashboardPage";
import CustomerFavoritesPage from "../pages/CustomerFavoritesPage";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";
import HomePage from "../pages/HomePage";
import LoginPage from "../pages/LoginPage";
import NotFoundPage from "../pages/NotFoundPage";
import RegisterPage from "../pages/RegisterPage";
import ResetPasswordPage from "../pages/ResetPasswordPage";
import ServicesPage from "../pages/ServicesPage";
import VendorDashboardPage from "../pages/VendorDashboardPage";
import VendorAvailabilityPage from "../pages/VendorAvailabilityPage";
import VendorDetailsPage from "../pages/VendorDetailsPage";
import VendorProfilePage from "../pages/VendorProfilePage";
import VendorsPage from "../pages/VendorsPage";
import BookingPaymentPage from "../pages/BookingPaymentPage";
import PaymentResultPage from "../pages/PaymentResultPage";
import PaymentHistoryPage from "../pages/PaymentHistoryPage";
import VendorEarningsPage from "../pages/VendorEarningsPage";
import AdminPaymentsPage from "../pages/AdminPaymentsPage";
import VendorVerificationPage from "../pages/VendorVerificationPage";
import AdminCancellationsPage from "../pages/AdminCancellationsPage";

export const appRoutes = [
  {
    element: <MainLayout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/services", element: <ServicesPage /> },
      { path: "/vendors", element: <VendorsPage /> },
      { path: "/vendors/:id", element: <VendorDetailsPage /> },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={["customer"]} />,
    children: [
      {
        element: <MainLayout />,
        children: [
          { path: "/booking/:vendorId", element: <BookingRequestPage /> },
          { path: "/payments/success", element: <PaymentResultPage /> },
          { path: "/payments/failed", element: <PaymentResultPage failed /> },
        ],
      },
      {
        element: <DashboardLayout />,
        children: [
          {
            path: "/customer/dashboard",
            element: <CustomerDashboardPage />,
          },
          {
            path: "/customer/favorites",
            element: <CustomerFavoritesPage />,
          },
          { path: "/bookings/:bookingId/payment", element: <BookingPaymentPage /> },
          { path: "/customer/bookings/:bookingId/payments", element: <BookingPaymentPage /> },
          { path: "/customer/payments", element: <PaymentHistoryPage /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={["vendor"]} />,
    children: [
      {
        element: <DashboardLayout vendor />,
        children: [
          { path: "/vendor/dashboard", element: <VendorDashboardPage /> },
          { path: "/vendor/availability", element: <VendorAvailabilityPage /> },
          { path: "/vendor/profile-setup", element: <VendorProfilePage /> },
          { path: "/vendor/verification", element: <VendorVerificationPage /> },
          { path: "/vendor/earnings", element: <VendorEarningsPage /> },
          { path: "/vendor/payouts/:payoutId", element: <VendorEarningsPage /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={["admin"]} />,
    children: [
      {
        element: <MainLayout />,
        children: [
          { path: "/admin", element: <AdminDashboardPage /> },
          { path: "/admin/vendors/unverified", element: <AdminVerifyVendorsPage /> },
          { path: "/admin/vendors/reported", element: <AdminReportedVendorsPage /> },
          { path: "/admin/reviews", element: <AdminReviewsPage /> },
          { path: "/admin/bookings", element: <AdminBookingsPage /> },
          { path: "/admin/payments", element: <AdminPaymentsPage /> },
          { path: "/admin/cancellations", element: <AdminCancellationsPage /> },
          { path: "/admin/payments/failed", element: <AdminPaymentsPage failed /> },
        ],
      },
    ],
  },
  { path: "/dashboard", element: <Navigate to="/customer/dashboard" replace /> },
  {
    path: "/vendor/profile",
    element: <Navigate to="/vendor/profile-setup" replace />,
  },
  {
    path: "*",
    element: <MainLayout />,
    children: [{ path: "*", element: <NotFoundPage /> }],
  },
];
