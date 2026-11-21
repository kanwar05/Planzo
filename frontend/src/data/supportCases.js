export const supportCategories = {
  vendor_unresponsive: "Vendor not responding",
  cancellation_disagreement: "Cancellation disagreement",
  vendor_no_show: "Vendor no-show",
  service_not_delivered: "Service not delivered as agreed",
  service_quality: "Incorrect service or quality concern",
  payment_refund_question: "Payment or refund question",
};
export const supportStatuses = { open: "Open", investigating: "Investigating", resolved: "Resolved", closed: "Closed" };
export const supportTransitions = { open: ["investigating", "resolved"], investigating: ["resolved"], resolved: ["closed", "investigating"], closed: ["investigating"] };
export const eventLabels = { created: "Case opened", comment: "Public update", status_changed: "Status changed", assigned: "Case assignment", resolved: "Resolution recorded", closed: "Case closed", reopened: "Case reopened", private_note: "Private administrator note", evidence_added: "Evidence added" };
