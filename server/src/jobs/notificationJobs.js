import Booking from "../models/Booking.js";
import Review from "../models/Review.js";
import { safeCreateNotification } from "../controllers/notificationController.js";
import {
  ONE_DAY_MS,
  getNotificationTimings,
  sendBookingReminderNotification,
  sendReviewReminderNotification,
} from "../services/transactionalNotificationService.js";

const { bookingReminderLeadMs, reviewReminderDelayMs } = getNotificationTimings();
const DEFAULT_JOB_INTERVAL_MS = Number(process.env.NOTIFICATION_JOB_INTERVAL_MS) || 60 * 60 * 1000;

const now = () => new Date();

const hasDeliveryFailure = (deliveries = []) =>
  (Array.isArray(deliveries) ? deliveries : [deliveries]).some((deliveryGroup) =>
    Object.values(deliveryGroup || {}).some((delivery) => delivery?.error),
  );

const normalizeDeliveries = (deliveries = []) =>
  (Array.isArray(deliveries) ? deliveries : [deliveries]);

async function populateBookingForReminders(query) {
  return query
    .populate("customerId", "name email phone notificationPreferences")
    .populate({
      path: "vendorId",
      select: "businessName userId",
      populate: {
        path: "userId",
        select: "name email phone notificationPreferences",
      },
    });
}

export async function sendDueBookingReminders() {
  const dueBookings = await populateBookingForReminders(
    Booking.find({
      status: { $in: ["pending", "accepted"] },
      bookingReminderSentAt: null,
      bookingReminderDueAt: { $lte: now() },
    }).sort({ bookingReminderDueAt: 1 }),
  );

  let processed = 0;
  for (const booking of dueBookings) {
    if (!booking.customerId || !booking.vendorId?.userId) continue;

    const deliveries = normalizeDeliveries(
      await sendBookingReminderNotification({
        customer: booking.customerId,
        vendorUser: booking.vendorId.userId,
        vendorName: booking.vendorId.businessName,
        booking,
      }),
    );

    if (hasDeliveryFailure(deliveries)) {
      continue;
    }

    await safeCreateNotification(
      booking.customerId._id,
      "booking_reminder",
      "Upcoming Booking Reminder",
      `Reminder: your booking for ${booking.eventType} is coming up on ${booking.eventDateOnly || booking.eventDate}.`,
      { bookingId: booking._id, vendorId: booking.vendorId._id },
    );

    booking.bookingReminderSentAt = now();
    await booking.save({ validateBeforeSave: false });
    processed += 1;
  }

  return processed;
}

export async function sendDueReviewReminders() {
  const dueBookings = await populateBookingForReminders(
    Booking.find({
      status: "completed",
      reviewReminderSentAt: null,
      reviewReminderDueAt: { $lte: now() },
    }).sort({ reviewReminderDueAt: 1 }),
  );

  let processed = 0;
  for (const booking of dueBookings) {
    if (!booking.customerId || !booking.vendorId?.businessName) continue;

    const reviewExists = await Review.exists({ bookingId: booking._id });
    if (reviewExists) {
      booking.reviewReminderSentAt = now();
      await booking.save({ validateBeforeSave: false });
      continue;
    }

    const deliveries = normalizeDeliveries(
      await sendReviewReminderNotification({
        customer: booking.customerId,
        vendorName: booking.vendorId.businessName,
        booking,
      }),
    );

    if (hasDeliveryFailure(deliveries)) {
      continue;
    }

    await safeCreateNotification(
      booking.customerId._id,
      "review_reminder",
      "Please Leave a Review",
      `Please leave a review for ${booking.vendorId.businessName} after your ${booking.eventType} booking.`,
      { bookingId: booking._id, vendorId: booking.vendorId._id },
    );

    booking.reviewReminderSentAt = now();
    await booking.save({ validateBeforeSave: false });
    processed += 1;
  }

  return processed;
}

export async function runNotificationJobs() {
  const [bookingReminders, reviewReminders] = await Promise.all([
    sendDueBookingReminders(),
    sendDueReviewReminders(),
  ]);

  return { bookingReminders, reviewReminders };
}

export function startNotificationSchedulers() {
  if (process.env.NODE_ENV === "test") {
    return null;
  }

  const intervalId = setInterval(() => {
    runNotificationJobs().catch((error) => {
      console.error(`Notification job failed: ${error.message}`);
    });
  }, DEFAULT_JOB_INTERVAL_MS);

  runNotificationJobs().catch((error) => {
    console.error(`Initial notification job failed: ${error.message}`);
  });

  return intervalId;
}

export function getReminderScheduleDefaults() {
  return {
    bookingReminderLeadMs,
    reviewReminderDelayMs,
    jobIntervalMs: DEFAULT_JOB_INTERVAL_MS,
  };
}