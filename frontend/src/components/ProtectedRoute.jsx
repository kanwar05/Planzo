import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ allowedRoles = [] }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-coral/20 border-t-coral" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    const destination =
      user.role === "admin"
        ? "/admin"
        : user.role === "vendor"
          ? "/vendor/dashboard"
          : "/customer/dashboard";
    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
}
