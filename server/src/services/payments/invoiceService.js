import crypto from "node:crypto";
import PDFDocument from "pdfkit";

export const ensureInvoiceNumber = async (payment) => {
  if (!payment.invoiceNumber) { payment.invoiceNumber = `PZ-${new Date().getUTCFullYear()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`; await payment.save(); }
  return payment.invoiceNumber;
};
const money = (paise) => `INR ${(Number(paise || 0) / 100).toFixed(2)}`;
export const streamInvoice = async ({ payment, booking, customer, vendor, res }) => {
  await ensureInvoiceNumber(payment); const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${payment.invoiceNumber}.pdf"`, "Cache-Control": "private, no-store" }); doc.pipe(res);
  doc.fontSize(24).fillColor("#ef6f61").text(process.env.INVOICE_COMPANY_NAME || "Planzo");
  doc.fontSize(10).fillColor("#444").text(process.env.INVOICE_COMPANY_ADDRESS || "").text(process.env.INVOICE_COMPANY_EMAIL || "").text(process.env.INVOICE_GST_NUMBER ? `GSTIN: ${process.env.INVOICE_GST_NUMBER}` : "");
  doc.moveDown().fontSize(18).fillColor("#111").text(payment.installmentType === "final_payment" ? "Final consolidated invoice" : "Payment receipt");
  const rows = [["Invoice", payment.invoiceNumber], ["Booking", String(booking._id)], ["Transaction", payment.transactionId || "—"], ["Provider payment", payment.providerPaymentId || "—"], ["Customer", `${customer.name} (${customer.email})`], ["Vendor", vendor.businessName], ["Event", `${booking.eventType} — ${booking.eventDateOnly || booking.eventDate}`], ["Installment", payment.installmentType.replaceAll("_", " ")], ["Installment amount", money(payment.amount)], ["Total booking amount", money(booking.totalAmount)], ["Amount paid", money(booking.totalPaidAmount)], ["Remaining", money(booking.remainingAmount)], ["Refunded", money(payment.refundedAmount)], ["Payment method", payment.paymentMethod || "Razorpay"], ["Status", payment.status], ["Payment date", payment.paidAt?.toISOString() || "—"]];
  doc.moveDown(); rows.forEach(([key, value]) => { doc.font("Helvetica-Bold").text(`${key}:`, { continued: true, width: 150 }); doc.font("Helvetica").text(` ${value}`); }); doc.moveDown(2).fontSize(9).fillColor("#666").text("Amounts are recorded in integer paise. This system does not store card or bank credentials."); doc.end();
};
