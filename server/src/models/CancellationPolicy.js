import mongoose from "mongoose";
import { cancellationPolicyDefinition } from "./cancellationPolicySchemas.js";

const schema = new mongoose.Schema({
  ...cancellationPolicyDefinition,
  key: { type: String, enum: ["standard"], default: "standard", required: true },
  version: { type: Number, min: 2, max: 100, required: true, validate: Number.isSafeInteger },
  publishedById: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, select: false },
}, { collection: "bookingcancellationpolicies", timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
schema.index({ version: 1 }, { unique: true, name: "one_cancellation_policy_per_version" });
schema.pre("save", function appendOnly(next) { next(this.isNew ? undefined : new Error("Cancellation policy versions are append-only.")); });
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"])
  schema.pre(operation, function appendOnly(next) { next(new Error("Cancellation policy versions are append-only.")); });
schema.pre("deleteOne", { document: true, query: false }, function appendOnly(next) { next(new Error("Cancellation policy versions are append-only.")); });
export default mongoose.model("CancellationPolicy", schema);
