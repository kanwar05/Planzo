import { useEffect, useState } from "react";
import {
  getAdminDashboard,
  getCustomerDashboard,
  getVendorDashboard,
} from "../services/dashboardService";
import { getApiError } from "../utils/apiError";

const loaders = {
  admin: getAdminDashboard,
  customer: getCustomerDashboard,
  vendor: getVendorDashboard,
};

export function useDashboardAnalytics(role, params = {}) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(Boolean(role));
  const [error, setError] = useState("");

  useEffect(() => {
    const loader = loaders[role];
    if (!loader) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError("");

    loader(params)
      .then((data) => {
        if (active) setDashboard(data);
      })
      .catch((requestError) => {
        if (active) {
          setError(getApiError(requestError, "Unable to load dashboard data."));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [role, JSON.stringify(params)]);

  return { dashboard, setDashboard, loading, error, setError };
}
