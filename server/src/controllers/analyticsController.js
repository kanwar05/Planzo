import {
  getAdminDashboardAnalytics,
  getCustomerDashboardAnalytics,
  getVendorDashboardAnalytics,
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

export const getAdminDashboard = asyncHandler(async (req, res) => {
  const dashboard = await getAdminDashboardAnalytics(req.query);

  res.status(200).json({
    success: true,
    dashboard,
  });
});
