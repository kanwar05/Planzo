import mongoose from "mongoose";
import { SUPPORT_CASE_STATUSES } from "./SupportCase.js";

export const SUPPORT_CASE_EVENT_KINDS = [
  "created", "comment", "status_changed", "assigned", "resolved", "closed", "reopened", "private_note", "evidence_added",
];
const supportCaseEventSchema = new mongoose.Schema({
  caseId: { type: mongoose.Schema.Types.ObjectId, ref: "SupportCase", required: true, immutable: true },
  sequence: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger, immutable: true },
  kind: { type: String, enum: SUPPORT_CASE_EVENT_KINDS, required: true, immutable: true },
  visibility: { type: String, enum: ["participants", "admin"], required: true, immutable: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, select: false },
  actorRole: { type: String, enum: ["customer", "vendor", "admin"], required: true, immutable: true },
  body: { type: String, maxlength: 4000, default: "", immutable: true },
  previousStatus: { type: String, enum: SUPPORT_CASE_STATUSES, default: undefined, immutable: true },
  status: { type: String, enum: SUPPORT_CASE_STATUSES, default: undefined, immutable: true },
  assignedAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined, immutable: true, select: false },
  evidenceIds: { type: [mongoose.Schema.Types.ObjectId], default: [], immutable: true, validate: values => values.length <= 20 },
  requestKeyHash: { type: String, default: undefined, match: /^[a-f0-9]{64}$/, immutable: true, select: false },
}, { collection: "bookingsupportevents", timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

supportCaseEventSchema.index({ caseId: 1, sequence: 1 }, { unique: true, name: "one_support_event_per_revision" });
supportCaseEventSchema.index({ caseId: 1, actorId: 1, requestKeyHash: 1 }, {
  unique: true, name: "one_support_event_per_actor_retry_key", partialFilterExpression: { requestKeyHash: { $type: "string" } },
});
supportCaseEventSchema.index({ caseId: 1, visibility: 1, sequence: -1 });
supportCaseEventSchema.pre("save", function preventEventEdit(next) {
  next(this.isNew ? undefined : new Error("Support events are append-only."));
});
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"])
  supportCaseEventSchema.pre(operation, function preventEventMutation(next) { next(new Error("Support events are append-only.")); });
supportCaseEventSchema.pre("deleteOne", { document: true, query: false }, function preventEventRemoval(next) { next(new Error("Support events are append-only.")); });

export default mongoose.model("SupportCaseEvent", supportCaseEventSchema);
