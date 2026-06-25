import { Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import AuthLayout from "../layouts/AuthLayout";
import DashboardLayout from "../layouts/DashboardLayout";
import MainLayout from "../layouts/MainLayout";
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
import VendorDetailsPage from "../pages/VendorDetailsPage";
import VendorProfilePage from "../pages/VendorProfilePage";
import VendorsPage from "../pages/VendorsPage";

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
          { path: "/vendor/profile-setup", element: <VendorProfilePage /> },
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
