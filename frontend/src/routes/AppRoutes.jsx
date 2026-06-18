import MainLayout from "../layouts/MainLayout";
import AuthLayout from "../layouts/AuthLayout";
import DashboardLayout from "../layouts/DashboardLayout";
import ProtectedRoute from "../components/ProtectedRoute";
import HomePage from "../pages/HomePage";
import ServicesPage from "../pages/ServicesPage";
import VendorsPage from "../pages/VendorsPage";
import VendorDetailsPage from "../pages/VendorDetailsPage";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import BookingRequestPage from "../pages/BookingRequestPage";
import CustomerDashboardPage from "../pages/CustomerDashboardPage";
import VendorDashboardPage from "../pages/VendorDashboardPage";
import VendorProfilePage from "../pages/VendorProfilePage";
import NotFoundPage from "../pages/NotFoundPage";

export const appRoutes = [
  {
    element: <MainLayout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/services", element: <ServicesPage /> },
      { path: "/vendors", element: <VendorsPage /> },
      { path: "/vendors/:id", element: <VendorDetailsPage /> },
      { path: "/booking/:vendorId", element: <BookingRequestPage /> },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      { element: <DashboardLayout />, children: [{ path: "/dashboard", element: <CustomerDashboardPage /> }] },
      { element: <DashboardLayout vendor />, children: [{ path: "/vendor/dashboard", element: <VendorDashboardPage /> }, { path: "/vendor/profile", element: <VendorProfilePage /> }] },
    ],
  },
  { path: "*", element: <MainLayout />, children: [{ path: "*", element: <NotFoundPage /> }] },
];
