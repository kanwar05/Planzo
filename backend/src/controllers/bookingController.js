import Booking from "../models/Booking.js";

export async function createBooking(req, res, next) {
  try {
    const booking = await Booking.create({ ...req.body, customer: req.user._id });
    res.status(201).json({ success: true, booking });
  } catch (error) {
    next(error);
  }
}

export async function getMyBookings(req, res, next) {
  try {
    const query = req.user.role === "vendor"
      ? { vendor: req.query.vendorId }
      : { customer: req.user._id };
    const bookings = await Booking.find(query)
      .populate("customer", "name email phone")
      .populate("vendor", "businessName serviceCategory location")
      .sort({ createdAt: -1 });
    res.json({ success: true, count: bookings.length, bookings });
  } catch (error) {
    next(error);
  }
}

