import { Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../layouts/AuthLayout";
import DashboardLayout from "../layouts/DashboardLayout";
import MainLayout from "../layouts/MainLayout";
import AdminDashboardPage from "../pages/AdminDashboardPage";
import AdminBookingsPage from "../pages/AdminBookingsPage";
import AdminUsersPage from "../pages/AdminUsersPage";
import AdminVerifyVendorsPage from "../pages/AdminVerifyVendorsPage";
import BookingRequestPage from "../pages/BookingRequestPage";
import CustomerDashboardPage from "../pages/CustomerDashboardPage";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";
import HomePage from "../pages/HomePage";
import LoginPage from "../pages/LoginPage";
import NotFoundPage from "../pages/NotFoundPage";
import RegisterPage from "../pages/RegisterPage";
import ResetPasswordPage from "../pages/ResetPasswordPage";
import ServicesPage from "../pages/ServicesPage";
import SettingsPage from "../pages/SettingsPage";
import VendorDashboardPage from "../pages/VendorDashboardPage";
import VendorAvailabilityPage from "../pages/VendorAvailabilityPage";
import VendorDetailsPage from "../pages/VendorDetailsPage";
import VendorProfilePage from "../pages/VendorProfilePage";
import VendorsPage from "../pages/VendorsPage";
import VerifyEmailPage from "../pages/VerifyEmailPage";
function DashboardRedirect() {
  const {
    user
  } = useAuth();
  const to = user?.role === "admin" ? "/admin" : user?.role === "vendor" ? "/vendor/dashboard" : "/customer/dashboard";
  return <Navigate to={to} replace />;
}
export const appRoutes = [{
  element: <MainLayout />,
  children: [{
    path: "/",
    element: <HomePage />
  }, {
    path: "/services",
    element: <ServicesPage />
  }, {
    path: "/vendors",
    element: <VendorsPage />
  }, {
    path: "/vendors/:id",
    element: <VendorDetailsPage />
  }]
}, {
  element: <AuthLayout />,
  children: [{
    path: "/login",
    element: <LoginPage />
  }, {
    path: "/register",
    element: <RegisterPage />
  }, {
    path: "/forgot-password",
    element: <ForgotPasswordPage />
  }, {
    path: "/reset-password",
    element: <ResetPasswordPage />
  }, {
    path: "/verify-email",
    element: <VerifyEmailPage />
  }]
}, {
  element: <ProtectedRoute allowedRoles={["customer"]} />,
  children: [{
    element: <MainLayout />,
    children: [{
      path: "/booking/:vendorId",
      element: <BookingRequestPage />
    }]
  }, {
    element: <DashboardLayout />,
    children: [{
      path: "/customer/dashboard",
      element: <CustomerDashboardPage />
    }, {
      path: "/settings",
      element: <SettingsPage />
    }]
  }]
}, {
  element: <ProtectedRoute allowedRoles={["vendor"]} />,
  children: [{
    element: <DashboardLayout />,
    children: [{
      path: "/vendor/dashboard",
      element: <VendorDashboardPage />
    }, {
      path: "/vendor/availability",
      element: <VendorAvailabilityPage />
    }, {
      path: "/vendor/profile-setup",
      element: <VendorProfilePage />
    }, {
      path: "/vendor/settings",
      element: <SettingsPage />
    }]
  }]
}, {
  element: <ProtectedRoute allowedRoles={["admin"]} />,
  children: [{
    element: <DashboardLayout />,
    children: [{
      path: "/admin",
      element: <AdminDashboardPage />
    }, {
      path: "/admin/users",
      element: <AdminUsersPage />
    }, {
      path: "/admin/vendors/unverified",
      element: <AdminVerifyVendorsPage />
    }, {
      path: "/admin/bookings",
      element: <AdminBookingsPage />
    }, {
      path: "/admin/settings",
      element: <SettingsPage />
    }]
  }]
}, {
  path: "/dashboard",
  element: <ProtectedRoute />,
  children: [{
    index: true,
    element: <DashboardRedirect />
  }]
}, {
  path: "/vendor/profile",
  element: <Navigate to="/vendor/profile-setup" replace />
}, {
  path: "*",
  element: <MainLayout />,
  children: [{
    path: "*",
    element: <NotFoundPage />
  }]
}];
