import { api } from "./api";

const dashboardFrom = (response) =>
  response.data.dashboard || response.data.data?.dashboard || response.data;

export const getCustomerDashboard = async (params = {}) => {
  const response = await api.get("/analytics/customer", { params });
  return dashboardFrom(response);
};

export const getVendorDashboard = async (params = {}) => {
  const response = await api.get("/analytics/vendor", { params });
  return dashboardFrom(response);
};

export const getAdminDashboard = async (params = {}) => {
  const response = await api.get("/analytics/admin", { params });
  return dashboardFrom(response);
};
