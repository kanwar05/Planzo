import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  CheckCircle,
  AlertCircle,
  Calendar,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import LoadingSkeleton from "../components/LoadingSkeleton";
import {api} from "../services/api";
import { getApiError } from "../utils/apiError";

export default function AdminDashboardPage() {
  useDocumentTitle("Admin Dashboard");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/");
      return;
    }

    loadStats();
  }, [user, navigate]);

  const loadStats = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/admin/stats");
      setStats(response.data.data?.stats || response.data.stats || response.data.data);
    } catch (err) {
      setError(getApiError(err, "Failed to load dashboard stats"));
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== "admin") {
    return (
      <section className="section-pad container-shell min-h-screen">
        <EmptyState
          title="Access Denied"
          description="You do not have permission to access this page."
        />
      </section>
    );
  }

  if (loading) {
    return (
      <section className="section-pad container-shell min-h-screen">
        <LoadingSkeleton />
      </section>
    );
  }

  if (error) {
    return (
      <section className="section-pad container-shell min-h-screen">
        <EmptyState
          title="Failed to load dashboard"
          description={error}
        />
      </section>
    );
  }

  const cards = [
    {
      title: "Total Users",
      value: stats?.totalUsers || 0,
      icon: Users,
      color: "bg-blue-50 border-blue-200",
      textColor: "text-blue-600",
    },
    {
      title: "Vendors to Verify",
      value: stats?.unverifiedVendors || 0,
      icon: CheckCircle,
      color: "bg-amber-50 border-amber-200",
      textColor: "text-amber-600",
      link: "/admin/vendors/unverified",
    },
    {
      title: "Reported Vendors",
      value: stats?.reportedVendors || 0,
      icon: AlertCircle,
      color: "bg-red-50 border-red-200",
      textColor: "text-red-600",
      link: "/admin/vendors/reported",
    },
    {
      title: "Total Reviews",
      value: stats?.totalReviews || 0,
      icon: MessageSquare,
      color: "bg-green-50 border-green-200",
      textColor: "text-green-600",
      link: "/admin/reviews",
    },
    {
      title: "Total Bookings",
      value: stats?.totalBookings || 0,
      icon: Calendar,
      color: "bg-purple-50 border-purple-200",
      textColor: "text-purple-600",
      link: "/admin/bookings",
    },
    {
      title: "Total Vendors",
      value: stats?.totalVendors || 0,
      icon: Users,
      color: "bg-indigo-50 border-indigo-200",
      textColor: "text-indigo-600",
    },
  ];

  return (
    <section className="section-pad container-shell">
      <div className="max-w-6xl">
        <div className="mb-12">
          <h1 className="text-4xl font-extrabold">Admin Dashboard</h1>
          <p className="mt-2 text-ink/50">
            Manage vendors, reviews, and bookings
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className={`rounded-[1.75rem] border p-6 ${card.color}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink/60">
                      {card.title}
                    </p>
                    <p className={`mt-2 text-3xl font-extrabold ${card.textColor}`}>
                      {card.value}
                    </p>
                  </div>
                  <Icon className={`h-8 w-8 ${card.textColor}`} />
                </div>
                {card.link && (
                  <Button
                    to={card.link}
                    size="sm"
                    variant="outline"
                    className="mt-4"
                  >
                    View Details
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="mt-12">
          <h2 className="text-2xl font-extrabold mb-6">Quick Actions</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Button to="/admin/vendors/unverified" variant="outline">
              Verify Vendors
            </Button>
            <Button to="/admin/vendors/reported" variant="outline">
              Review Reports
            </Button>
            <Button to="/admin/reviews" variant="outline">
              Moderate Reviews
            </Button>
            <Button to="/admin/bookings" variant="outline">
              View Bookings
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
