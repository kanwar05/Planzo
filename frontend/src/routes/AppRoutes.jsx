import { lazy, Suspense } from "react";
import { Navigate, useLocation } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import { useAuth } from "../context/AuthContext";
import MainLayout from "../layouts/MainLayout";
import HomePage from "../pages/HomePage";
const AuthLayout = lazy(() => import("../layouts/AuthLayout"));
const DashboardLayout = lazy(() => import("../layouts/DashboardLayout"));
const AdminDashboardPage = lazy(() => import("../pages/AdminDashboardPage"));
const AdminBookingsPage = lazy(() => import("../pages/AdminBookingsPage"));
const AdminUsersPage = lazy(() => import("../pages/AdminUsersPage"));
const AdminVerifyVendorsPage = lazy(() => import("../pages/AdminVerifyVendorsPage"));
const BookingRequestPage = lazy(() => import("../pages/BookingRequestPage"));
const CustomerDashboardPage = lazy(() => import("../pages/CustomerDashboardPage"));
const ForgotPasswordPage = lazy(() => import("../pages/ForgotPasswordPage"));
const LoginPage = lazy(() => import("../pages/LoginPage"));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage"));
const RegisterPage = lazy(() => import("../pages/RegisterPage"));
const ResetPasswordPage = lazy(() => import("../pages/ResetPasswordPage"));
const ServicesPage = lazy(() => import("../pages/ServicesPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const VendorDashboardPage = lazy(() => import("../pages/VendorDashboardPage"));
const VendorAvailabilityPage = lazy(() => import("../pages/VendorAvailabilityPage"));
const VendorDetailsPage = lazy(() => import("../pages/VendorDetailsPage"));
const VendorProfilePage = lazy(() => import("../pages/VendorProfilePage"));
const VendorsPage = lazy(() => import("../pages/VendorsPage"));
const VerifyEmailPage = lazy(() => import("../pages/VerifyEmailPage"));
function Page({ component: Component }) {
  const { pathname } = useLocation();
  return (
    <Suspense fallback={<PageLoading />}>
      <div key={pathname} className={pathname === "/" ? undefined : "page-enter"}>
        <Component />
      </div>
    </Suspense>
  );
}

function PageLoading() {
  return (
    <div className="container-shell min-h-[60vh] py-12" role="status">
      <span className="inline-flex items-center gap-3 text-sm text-ink/65">
        <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-ink/15 border-t-coral" />
        Getting things ready…
      </span>
    </div>
  );
}

function Layout({ component: Component }) {
  return <Suspense fallback={<PageLoading />}><Component /></Suspense>;
}
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
    element: <Page component={HomePage} />
  }, {
    path: "/services",
    element: <Page component={ServicesPage} />
  }, {
    path: "/vendors",
    element: <Page component={VendorsPage} />
  }, {
    path: "/vendors/:id",
    element: <Page component={VendorDetailsPage} />
  }]
}, {
  element: <Layout component={AuthLayout} />,
  children: [{
    path: "/login",
    element: <Page component={LoginPage} />
  }, {
    path: "/register",
    element: <Page component={RegisterPage} />
  }, {
    path: "/forgot-password",
    element: <Page component={ForgotPasswordPage} />
  }, {
    path: "/reset-password",
    element: <Page component={ResetPasswordPage} />
  }, {
    path: "/verify-email",
    element: <Page component={VerifyEmailPage} />
  }]
}, {
  element: <ProtectedRoute allowedRoles={["customer"]} />,
  children: [{
    element: <MainLayout />,
    children: [{
      path: "/booking/:vendorId",
      element: <Page component={BookingRequestPage} />
    }]
  }, {
    element: <Layout component={DashboardLayout} />,
    children: [{
      path: "/customer/dashboard",
      element: <Page component={CustomerDashboardPage} />
    }, {
      path: "/settings",
      element: <Page component={SettingsPage} />
    }]
  }]
}, {
  element: <ProtectedRoute allowedRoles={["vendor"]} />,
  children: [{
    element: <Layout component={DashboardLayout} />,
    children: [{
      path: "/vendor/dashboard",
      element: <Page component={VendorDashboardPage} />
    }, {
      path: "/vendor/availability",
      element: <Page component={VendorAvailabilityPage} />
    }, {
      path: "/vendor/profile-setup",
      element: <Page component={VendorProfilePage} />
    }, {
      path: "/vendor/settings",
      element: <Page component={SettingsPage} />
    }]
  }]
}, {
  element: <ProtectedRoute allowedRoles={["admin"]} />,
  children: [{
    element: <Layout component={DashboardLayout} />,
    children: [{
      path: "/admin",
      element: <Page component={AdminDashboardPage} />
    }, {
      path: "/admin/users",
      element: <Page component={AdminUsersPage} />
    }, {
      path: "/admin/vendors/unverified",
      element: <Page component={AdminVerifyVendorsPage} />
    }, {
      path: "/admin/bookings",
      element: <Page component={AdminBookingsPage} />
    }, {
      path: "/admin/settings",
      element: <Page component={SettingsPage} />
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
    element: <Page component={NotFoundPage} />
  }]
}];
