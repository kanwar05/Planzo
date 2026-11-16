import Booking from "../models/Booking.js";
import asyncHandler from "../utils/asyncHandler.js";
import { bookingView, populateBooking } from "../services/bookingViewService.js";
import { decideQuotation, offerQuotation, quotationHistory } from "../services/quotationService.js";
import { quotationView } from "../services/quotationViewService.js";

const renderedBooking = async (booking, viewer) =>
  bookingView(await populateBooking(Booking.findById(booking._id)), viewer);

export const getQuotations = asyncHandler(async (req, res) => {
  const quotations = await quotationHistory(req.params.bookingId, req.user);
  res.json({ success: true, quotations });
});
export const createQuotation = asyncHandler(async (req, res) => {
  const result = await offerQuotation(req.params.bookingId, req.user, req.body, req.get("Idempotency-Key"));
  res.status(result.replayed ? 200 : 201).json({ success: true,
    message: result.replayed ? "Quotation already saved." : "Quotation sent.",
    quotation: quotationView(result.quotation), booking: await renderedBooking(result.booking, req.user) });
});
const decide = decision => asyncHandler(async (req, res) => {
  const booking = await decideQuotation(req.params.bookingId, req.params.revision, req.user, decision);
  res.json({ success: true, message: decision === "accept" ? "Quotation accepted." : "Quotation rejected.",
    booking: await renderedBooking(booking, req.user) });
});
export const acceptQuotation = decide("accept");
export const rejectQuotation = decide("reject");
