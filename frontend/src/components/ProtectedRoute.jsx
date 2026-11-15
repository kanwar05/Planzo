import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getDashboardPath } from "../utils/navigation";

export default function ProtectedRoute({ allowedRoles = [] }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream" role="status">
        <div className="flex items-center gap-3 text-sm text-ink/65">
          <span aria-hidden="true" className="h-6 w-6 animate-spin rounded-full border-2 border-coral/20 border-t-coral" />
          Opening your account…
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  return <Outlet />;
}
