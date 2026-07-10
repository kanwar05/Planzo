import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Favorite from "../models/Favorite.js";
import Notification from "../models/Notification.js";
import Review from "../models/Review.js";
import User from "../models/User.js";
import Vendor from "../models/Vendor.js";

const MAX_LIMIT = 50;
const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();

const objectId = (value) => new mongoose.Types.ObjectId(String(value));

const clampLimit = (value, fallback = 8) =>
  Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), MAX_LIMIT);

const clampPage = (value) => Math.max(Number.parseInt(value, 10) || 1, 1);

const startOfDay = (date) => {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const addMonths = (date, months) => {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

const parseDateRange = (query = {}) => {
  const now = new Date();
  const fallbackStart = addMonths(now, -5);
  const startDate = query.startDate ? new Date(query.startDate) : fallbackStart;
  const endDate = query.endDate ? new Date(query.endDate) : now;

  return {
    startDate: Number.isNaN(startDate.getTime()) ? fallbackStart : startOfDay(startDate),
    endDate: Number.isNaN(endDate.getTime()) ? now : addDays(startOfDay(endDate), 1),
  };
};

const monthKey = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const monthLabel = (date) =>
  date.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });

const buildMonthlyBuckets = (startDate, endDate) => {
  const buckets = [];
  let cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));

  while (cursor <= end && buckets.length < 18) {
    buckets.push({
      key: monthKey(cursor),
      label: monthLabel(cursor),
      bookings: 0,
      revenue: 0,
      users: 0,
    });
    cursor = addMonths(cursor, 1);
  }

  return buckets;
};

const fillMonthlyBuckets = (rows, startDate, endDate) => {
  const buckets = buildMonthlyBuckets(startDate, endDate);
  const byKey = new Map(buckets.map((item) => [item.key, item]));

  rows.forEach((row) => {
    const key = `${row._id.year}-${String(row._id.month).padStart(2, "0")}`;
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.bookings = row.bookings || bucket.bookings;
      bucket.revenue = row.revenue || bucket.revenue;
      bucket.users = row.users || bucket.users;
    }
  });

  return buckets;
};

const weeklyBuckets = (rows) => {
  const byKey = new Map(
    Array.from({ length: 7 }, (_, index) => {
      const date = addDays(startOfDay(new Date()), index - 6);
      return [
        date.toISOString().slice(0, 10),
        {
          key: date.toISOString().slice(0, 10),
          label: date.toLocaleDateString("en-IN", {
            weekday: "short",
            timeZone: "UTC",
          }),
          bookings: 0,
          revenue: 0,
        },
      ];
    }),
  );

  rows.forEach((row) => {
    const bucket = byKey.get(row._id);
    if (bucket) {
      bucket.bookings = row.bookings || 0;
      bucket.revenue = row.revenue || 0;
    }
  });

  return [...byKey.values()];
};

const paginationFrom = (query = {}) => {
  const page = clampPage(query.page);
  const limit = clampLimit(query.limit);
  return { page, limit, skip: (page - 1) * limit };
};

const paginateResult = (items, total, page, limit) => ({
  items,
  pagination: {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  },
});

const withCache = async (key, ttl, factory) => {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await factory();
  cache.set(key, { value, expiresAt: Date.now() + ttl });
  return value;
};

const bookingLookupStages = [
  {
    $lookup: {
      from: "users",
      localField: "customerId",
      foreignField: "_id",
      as: "customer",
      pipeline: [{ $project: { name: 1, email: 1, phone: 1 } }],
    },
  },
  {
    $lookup: {
      from: "vendors",
      localField: "vendorId",
      foreignField: "_id",
      as: "vendor",
      pipeline: [
        {
          $project: {
            businessName: 1,
            serviceCategory: 1,
            location: 1,
            profileImage: 1,
            coverImage: 1,
            portfolioImages: 1,
            averageRating: 1,
            reviewCount: 1,
            rating: 1,
            reviewsCount: 1,
            pricing: 1,
            verified: 1,
            verificationStatus: 1,
          },
        },
      ],
    },
  },
  { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
  { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
];

const bookingProjection = {
  eventType: 1,
  eventDate: 1,
  eventDateOnly: 1,
  eventStartTime: 1,
  eventEndTime: 1,
  eventLocation: 1,
  budget: 1,
  status: 1,
  specialRequirements: 1,
  createdAt: 1,
  customerId: "$customer",
  vendorId: "$vendor",
};

export const getCustomerDashboardAnalytics = async (userId, query = {}) => {
  const { startDate, endDate } = parseDateRange(query);
  const { page, limit, skip } = paginationFrom(query);
  const userObjectId = objectId(userId);
  const today = startOfDay(new Date());

  const [
    statusRows,
    upcomingRows,
    bookingPageRows,
    favoriteRows,
    notificationRows,
    monthlyRows,
    weeklyRows,
  ] = await Promise.all([
    Booking.aggregate([
      { $match: { customerId: userObjectId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          budget: { $sum: "$budget" },
        },
      },
    ]),
    Booking.aggregate([
      {
        $match: {
          customerId: userObjectId,
          status: { $in: ["pending", "accepted"] },
          eventDate: { $gte: today },
        },
      },
      { $sort: { eventDate: 1, createdAt: -1 } },
      { $limit: limit },
      ...bookingLookupStages,
      { $project: bookingProjection },
    ]),
    Booking.aggregate([
      { $match: { customerId: userObjectId } },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          items: [
            { $skip: skip },
            { $limit: limit },
            ...bookingLookupStages,
            { $project: bookingProjection },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]),
    Favorite.find({ customerId: userObjectId })
      .populate(
        "vendorId",
        "businessName serviceCategory pricing location profileImage coverImage portfolioImages averageRating reviewCount rating reviewsCount verified verificationStatus",
      )
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Notification.find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Booking.aggregate([
      {
        $match: {
          customerId: userObjectId,
          eventDate: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: { year: { $year: "$eventDate" }, month: { $month: "$eventDate" } },
          bookings: { $sum: 1 },
          revenue: { $sum: "$budget" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
    Booking.aggregate([
      {
        $match: {
          customerId: userObjectId,
          createdAt: { $gte: addDays(today, -6), $lt: addDays(today, 1) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          bookings: { $sum: 1 },
          revenue: { $sum: "$budget" },
        },
      },
    ]),
  ]);

  const byStatus = Object.fromEntries(statusRows.map((row) => [row._id, row.count]));
  const budgetByStatus = Object.fromEntries(statusRows.map((row) => [row._id, row.budget]));
  const bookingFacet = bookingPageRows[0] || { items: [], total: [] };
  const bookingTotal = bookingFacet.total[0]?.count || 0;
  const pendingPayments = (budgetByStatus.accepted || 0) + (budgetByStatus.pending || 0);

  return {
    filters: { startDate, endDate },
    summary: {
      totalBookings: bookingTotal,
      upcomingBookings: upcomingRows.length,
      completedBookings: byStatus.completed || 0,
      cancelledBookings: (byStatus.cancelled || 0) + (byStatus.rejected || 0),
      favoriteVendors: favoriteRows.length,
      pendingPayments,
    },
    bookingTimeline: upcomingRows,
    recentNotifications: notificationRows,
    recentChats: [],
    favorites: favoriteRows,
    bookings: paginateResult(bookingFacet.items, bookingTotal, page, limit),
    monthlyStats: fillMonthlyBuckets(monthlyRows, startDate, endDate),
    weeklyStats: weeklyBuckets(weeklyRows),
  };
};

const profileCompletion = (profile) => {
  if (!profile) return 0;
  const checks = [
    profile.businessName,
    profile.serviceCategory,
    profile.location,
    profile.description,
    profile.pricing,
    profile.profileImage?.url,
    profile.portfolioImages?.length,
    profile.packages?.length,
    profile.verificationDocuments?.length,
    profile.verificationStatus === "approved" || profile.verified,
  ];

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

export const getVendorDashboardAnalytics = async (userId, query = {}) => {
  const { startDate, endDate } = parseDateRange(query);
  const { page, limit, skip } = paginationFrom(query);
  const vendor = await Vendor.findOne({ userId }).lean();

  if (!vendor) {
    return {
      filters: { startDate, endDate },
      profile: null,
      summary: {
        totalBookings: 0,
        pendingRequests: 0,
        acceptedBookings: 0,
        monthlyRevenue: 0,
        totalEarnings: 0,
        profileCompletionPercentage: 0,
        averageRating: 0,
        reviewCount: 0,
        verificationStatus: "missing",
      },
      recentBookings: paginateResult([], 0, page, limit),
      recentMessages: [],
      upcomingEvents: [],
      calendarOccupancy: [],
      monthlyStats: fillMonthlyBuckets([], startDate, endDate),
      weeklyStats: weeklyBuckets([]),
    };
  }

  const vendorObjectId = vendor._id;
  const today = startOfDay(new Date());
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = addMonths(monthStart, 1);

  return withCache(
    `vendor:${vendorObjectId}:${startDate.toISOString()}:${endDate.toISOString()}:${page}:${limit}`,
    CACHE_TTL_MS,
    async () => {
      const [
        statusRows,
        monthlyRevenueRows,
        totalEarningsRows,
        recentBookingRows,
        upcomingRows,
        occupancyRows,
        monthlyRows,
        weeklyRows,
      ] = await Promise.all([
        Booking.aggregate([
          { $match: { vendorId: vendorObjectId } },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              budget: { $sum: "$budget" },
            },
          },
        ]),
        Booking.aggregate([
          {
            $match: {
              vendorId: vendorObjectId,
              status: { $in: ["accepted", "completed"] },
              eventDate: { $gte: monthStart, $lt: monthEnd },
            },
          },
          { $group: { _id: null, revenue: { $sum: "$budget" } } },
        ]),
        Booking.aggregate([
          {
            $match: {
              vendorId: vendorObjectId,
              status: "completed",
            },
          },
          { $group: { _id: null, revenue: { $sum: "$budget" } } },
        ]),
        Booking.aggregate([
          { $match: { vendorId: vendorObjectId } },
          { $sort: { createdAt: -1 } },
          {
            $facet: {
              items: [
                { $skip: skip },
                { $limit: limit },
                ...bookingLookupStages,
                { $project: bookingProjection },
              ],
              total: [{ $count: "count" }],
            },
          },
        ]),
        Booking.aggregate([
          {
            $match: {
              vendorId: vendorObjectId,
              status: { $in: ["pending", "accepted"] },
              eventDate: { $gte: today },
            },
          },
          { $sort: { eventDate: 1 } },
          { $limit: limit },
          ...bookingLookupStages,
          { $project: bookingProjection },
        ]),
        Booking.aggregate([
          {
            $match: {
              vendorId: vendorObjectId,
              eventDate: { $gte: monthStart, $lt: monthEnd },
            },
          },
          {
            $group: {
              _id: {
                date: { $dateToString: { format: "%Y-%m-%d", date: "$eventDate" } },
                status: "$status",
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.date": 1 } },
        ]),
        Booking.aggregate([
          {
            $match: {
              vendorId: vendorObjectId,
              eventDate: { $gte: startDate, $lt: endDate },
            },
          },
          {
            $group: {
              _id: { year: { $year: "$eventDate" }, month: { $month: "$eventDate" } },
              bookings: { $sum: 1 },
              revenue: {
                $sum: {
                  $cond: [
                    { $in: ["$status", ["accepted", "completed"]] },
                    "$budget",
                    0,
                  ],
                },
              },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]),
        Booking.aggregate([
          {
            $match: {
              vendorId: vendorObjectId,
              createdAt: { $gte: addDays(today, -6), $lt: addDays(today, 1) },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              bookings: { $sum: 1 },
              revenue: {
                $sum: {
                  $cond: [
                    { $in: ["$status", ["accepted", "completed"]] },
                    "$budget",
                    0,
                  ],
                },
              },
            },
          },
        ]),
      ]);

      const byStatus = Object.fromEntries(statusRows.map((row) => [row._id, row.count]));
      const bookingFacet = recentBookingRows[0] || { items: [], total: [] };
      const totalBookings = bookingFacet.total[0]?.count || 0;

      return {
        filters: { startDate, endDate },
        profile: vendor,
        summary: {
          totalBookings,
          pendingRequests: byStatus.pending || 0,
          acceptedBookings: byStatus.accepted || 0,
          monthlyRevenue: monthlyRevenueRows[0]?.revenue || 0,
          totalEarnings: totalEarningsRows[0]?.revenue || 0,
          profileCompletionPercentage: profileCompletion(vendor),
          averageRating: vendor.averageRating || vendor.rating || 0,
          reviewCount: vendor.reviewCount ?? vendor.reviewsCount ?? 0,
          verificationStatus: vendor.verificationStatus || (vendor.verified ? "approved" : "pending"),
        },
        recentBookings: paginateResult(bookingFacet.items, totalBookings, page, limit),
        recentMessages: [],
        upcomingEvents: upcomingRows,
        calendarOccupancy: occupancyRows.map((row) => ({
          date: row._id.date,
          status: row._id.status,
          count: row.count,
        })),
        monthlyStats: fillMonthlyBuckets(monthlyRows, startDate, endDate),
        weeklyStats: weeklyBuckets(weeklyRows),
      };
    },
  );
};

export const getAdminDashboardAnalytics = async (query = {}) => {
  const { startDate, endDate } = parseDateRange(query);
  const { page, limit, skip } = paginationFrom(query);

  return withCache(
    `admin:${startDate.toISOString()}:${endDate.toISOString()}:${page}:${limit}`,
    CACHE_TTL_MS,
    async () => {
      const [
        userRows,
        vendorRows,
        bookingTotal,
        bookingMonthlyRows,
        revenueMonthlyRows,
        userMonthlyRows,
        reportedRows,
        reportedTotal,
        activityRows,
      ] = await Promise.all([
        User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
        Vendor.aggregate([
          {
            $group: {
              _id: null,
              totalVendors: { $sum: 1 },
              verifiedVendors: { $sum: { $cond: ["$verified", 1, 0] } },
              pendingVerification: {
                $sum: { $cond: [{ $eq: ["$verificationStatus", "pending"] }, 1, 0] },
              },
            },
          },
        ]),
        Booking.countDocuments(),
        Booking.aggregate([
          {
            $match: {
              eventDate: { $gte: startDate, $lt: endDate },
            },
          },
          {
            $group: {
              _id: { year: { $year: "$eventDate" }, month: { $month: "$eventDate" } },
              bookings: { $sum: 1 },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]),
        Booking.aggregate([
          {
            $match: {
              status: { $in: ["accepted", "completed"] },
              eventDate: { $gte: startDate, $lt: endDate },
            },
          },
          {
            $group: {
              _id: { year: { $year: "$eventDate" }, month: { $month: "$eventDate" } },
              revenue: { $sum: "$budget" },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]),
        User.aggregate([
          {
            $match: {
              createdAt: { $gte: startDate, $lt: endDate },
            },
          },
          {
            $group: {
              _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
              users: { $sum: 1 },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]),
        Vendor.find({ reported: true })
          .populate("userId", "name email phone")
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Vendor.countDocuments({ reported: true }),
        Promise.all([
          Booking.find()
            .populate("customerId", "name email")
            .populate("vendorId", "businessName")
            .sort({ createdAt: -1 })
            .limit(Math.ceil(limit / 2))
            .lean(),
          Review.find({ status: { $in: ["flagged", "hidden"] } })
            .populate("customerId", "name email")
            .populate("vendorId", "businessName")
            .sort({ updatedAt: -1 })
            .limit(Math.floor(limit / 2))
            .lean(),
        ]),
      ]);

      const usersByRole = Object.fromEntries(userRows.map((row) => [row._id, row.count]));
      const vendorSummary = vendorRows[0] || {};
      const monthlyBookingGraph = fillMonthlyBuckets(bookingMonthlyRows, startDate, endDate);
      const monthlyRevenueGraph = fillMonthlyBuckets(revenueMonthlyRows, startDate, endDate);
      const userGrowth = fillMonthlyBuckets(userMonthlyRows, startDate, endDate);
      const [recentBookings, flaggedReviews] = activityRows;

      return {
        filters: { startDate, endDate },
        summary: {
          totalUsers: Object.values(usersByRole).reduce((sum, count) => sum + count, 0),
          customers: usersByRole.customer || 0,
          vendors: usersByRole.vendor || 0,
          admins: usersByRole.admin || 0,
          verifiedVendors: vendorSummary.verifiedVendors || 0,
          pendingVerification: vendorSummary.pendingVerification || 0,
          totalBookings: bookingTotal,
        },
        monthlyBookingGraph,
        revenueGraph: monthlyRevenueGraph,
        userGrowth,
        recentReports: paginateResult(reportedRows, reportedTotal, page, limit),
        platformActivity: [
          ...recentBookings.map((booking) => ({
            _id: `booking-${booking._id}`,
            type: "booking",
            title: `${booking.eventType} booking ${booking.status}`,
            actor: booking.customerId?.name || "Customer",
            subject: booking.vendorId?.businessName || "Vendor",
            createdAt: booking.createdAt,
          })),
          ...flaggedReviews.map((review) => ({
            _id: `review-${review._id}`,
            type: "review",
            title: `Review marked ${review.status}`,
            actor: review.customerId?.name || "Customer",
            subject: review.vendorId?.businessName || "Vendor",
            createdAt: review.updatedAt || review.createdAt,
          })),
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      };
    },
  );
};
