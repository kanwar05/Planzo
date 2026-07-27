import {
  getAdminDashboardAnalytics,
  getCustomerDashboardAnalytics,
  getVendorDashboardAnalytics,
  getVendorAnalyticsCsv,
} from "../services/analyticsService.js";
import asyncHandler from "../utils/asyncHandler.js";

export const getCustomerDashboard = asyncHandler(async (req, res) => {
  const dashboard = await getCustomerDashboardAnalytics(req.user._id, req.query);

  res.status(200).json({
    success: true,
    dashboard,
  });
});

export const getVendorDashboard = asyncHandler(async (req, res) => {
  const dashboard = await getVendorDashboardAnalytics(req.user._id, req.query);

  res.status(200).json({
    success: true,
    dashboard,
  });
});

export const exportVendorAnalytics = asyncHandler(async (req, res) => {
  const csv = await getVendorAnalyticsCsv(req.user._id, req.query);
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="vendor-analytics-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
  res.status(200).send(csv);
});

export const getAdminDashboard = asyncHandler(async (req, res) => {
  const dashboard = await getAdminDashboardAnalytics(req.query);

  res.status(200).json({
    success: true,
    dashboard,
  });
});
