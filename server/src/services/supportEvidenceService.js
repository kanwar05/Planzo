import mongoose from "mongoose";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.js";
import SupportCase, { MAX_SUPPORT_EVIDENCE } from "../models/SupportCase.js";
import SupportCaseEvent from "../models/SupportCaseEvent.js";
import { supportCaseView, supportCaseEventView } from "./supportCaseViewService.js";
import { authorizeSupportCaseAccess, lockSupportCaseActor, supportCaseRequestKey, supportRevision } from "./supportCaseService.js";
import { enqueueSupportCaseEmails } from "./supportNotificationService.js";
import { supportEvidenceFileInfo, cleanupSupportEvidence } from "../middleware/upload.js";
import { withBookingTransaction } from "../utils/vendorBookingTransaction.js";
import ApiError from "../utils/ApiError.js";
import { logEvent } from "../utils/logger.js";

const maxBytes = 5 * 1024 * 1024;
const mime = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
let testReader;
const rates = new Map();
function consume(actor, download = false) {
  const now = Date.now();
  for (const [key, entry] of rates) if (entry.until <= now) rates.delete(key);
  const key = `${actor._id}:${download ? "read" : "upload"}`;
  let entry = rates.get(key);
  if (!entry) {
    if (rates.size >= 10000) throw new ApiError(429, "Evidence service is busy. Try again shortly.");
    entry = { count: 0, until: now + (download ? 60000 : 900000) }; rates.set(key, entry);
  }
  if (++entry.count > (download ? 60 : 10)) throw new ApiError(429, "Too many evidence requests. Try again later.");
}
export function setSupportEvidenceReaderForTests(reader) {
  if (process.env.NODE_ENV !== "test") throw new Error("Evidence reader injection is test-only.");
  if (reader !== undefined && typeof reader !== "function") throw new Error("Invalid evidence reader.");
  testReader = reader; rates.clear();
}

export async function evidenceUploadPreflight(caseId, actor, key) {
  const requestKeyHash = supportCaseRequestKey(key);
  const access = await authorizeSupportCaseAccess(caseId, actor);
  consume(actor);
  const previous = await SupportCaseEvent.findOne({ caseId, actorId: actor._id, requestKeyHash });
  if (previous) {
    if (previous.kind !== "evidence_added") throw new ApiError(409, "This upload key already refers to another case operation.");
    return { replay: { case: supportCaseView(access.supportCase, actor), event: supportCaseEventView(previous, actor), replayed: true } };
  }
  await authorizeSupportCaseAccess(caseId, actor, { write: true });
  return { requestKeyHash };
}

export async function addSupportEvidence(caseId, actor, body, files, requestKeyHash) {
  const eventId = new mongoose.Types.ObjectId();
  let prepared = false;
  try {
    if (!body || typeof body !== "object" || Object.keys(body).some(key => key !== "revision"))
      throw new ApiError(400, "Provide the inspected case revision only.");
    const revision = supportRevision(typeof body.revision === "string" && /^[1-9]\d*$/.test(body.revision) ? Number(body.revision) : body.revision);
    if (!Array.isArray(files) || files.length < 1 || files.length > 3) throw new ApiError(400, "Upload one to three evidence images.");
    const evidence = files.map(file => ({ evidenceId: new mongoose.Types.ObjectId(), ...supportEvidenceFileInfo(file),
      uploaderId: actor._id, uploaderRole: actor.role, createdAt: new Date() }));
    const result = await withBookingTransaction(async session => {
      await lockSupportCaseActor(actor, session);
      const access = await authorizeSupportCaseAccess(caseId, actor, { session });
      const previous = await SupportCaseEvent.findOne({ caseId, actorId: actor._id, requestKeyHash }).session(session);
      if (previous) {
        if (previous.kind !== "evidence_added") throw new ApiError(409, "This upload key refers to another case operation.");
        return { case: supportCaseView(access.supportCase, actor), event: supportCaseEventView(previous, actor), replayed: true };
      }
      await authorizeSupportCaseAccess(caseId, actor, { write: true, session });
      if (access.supportCase.evidence.length + evidence.length > MAX_SUPPORT_EVIDENCE)
        throw new ApiError(409, `A support case can retain at most ${MAX_SUPPORT_EVIDENCE} evidence images.`);
      const updated = await SupportCase.findOneAndUpdate({ _id: caseId, revision, status: { $ne: "closed" } }, {
        $push: { evidence: { $each: evidence } }, $inc: { revision: 1 },
      }, { new: true, runValidators: true, session });
      if (!updated) throw new ApiError(409, "The case changed. Reload it before uploading again.");
      const [event] = await SupportCaseEvent.create([{ _id: eventId, caseId, sequence: updated.revision,
        kind: "evidence_added", visibility: "participants", actorId: actor._id, actorRole: actor.role,
        body: "Evidence added to the case.", evidenceIds: evidence.map(item => item.evidenceId), requestKeyHash }], { session });
      await enqueueSupportCaseEmails({ supportCase: updated, event, session });
      prepared = true;
      return { case: supportCaseView(updated, actor), event: supportCaseEventView(event, actor), replayed: false };
    });
    if (result.replayed) await cleanupSupportEvidence(files);
    return result;
  } catch (error) {
    // A callback failure cannot commit. Once commit may have begun, preserve
    // private uploads for reconciliation instead of deleting possible evidence.
    if (!prepared) await cleanupSupportEvidence(Array.isArray(files) ? files : []);
    else logEvent("warn", "support_evidence_commit_review_required");
    throw error;
  }
}

export async function getSupportEvidence(caseId, evidenceId, actor) {
  await authorizeSupportCaseAccess(caseId, actor);
  consume(actor, true);
  if (typeof evidenceId !== "string" || !/^[a-f0-9]{24}$/i.test(evidenceId)) throw new ApiError(400, "Invalid evidence id.");
  const record = await SupportCase.findById(caseId).select("+evidence.publicId +evidence.sha256");
  const item = record?.evidence.find(value => String(value.evidenceId) === evidenceId.toLowerCase());
  if (!item) throw new ApiError(404, "Evidence not found.");
  if (!/^planzo\/support-evidence\/[a-f0-9-]{36}$/.test(item.publicId || "") || !mime[item.format])
    throw new ApiError(409, "Evidence requires operator review.");
  return { publicId: item.publicId, format: item.format, evidenceId: String(item.evidenceId) };
}

export async function streamSupportEvidence(asset, res) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 20000);
  const closed = () => { if (!res.writableEnded) controller.abort(); };
  res.once("close", closed);
  try {
    let stream;
    if (process.env.NODE_ENV === "test") {
      if (!testReader) throw new ApiError(503, "The isolated evidence reader is not configured.");
      const data = await testReader(asset);
      stream = Buffer.isBuffer(data) ? Readable.from([data]) : data;
    } else {
      if (!isCloudinaryConfigured()) throw new ApiError(503, "Private evidence storage is not configured.");
      const signed = new URL(cloudinary.utils.private_download_url(asset.publicId, asset.format,
        { type: "authenticated", resource_type: "image", expires_at: Math.floor(Date.now() / 1000) + 60 }));
      if (signed.protocol !== "https:" || !/^api(?:-[a-z]{2})?\.cloudinary\.com$/.test(signed.hostname))
        throw new Error("Invalid private evidence origin.");
      const response = await fetch(signed, { signal: controller.signal, redirect: "error" });
      if (!response.ok || Number(response.headers.get("content-length")) > maxBytes || !response.body) throw new Error("Private evidence unavailable.");
      stream = Readable.fromWeb(response.body);
    }
    let bytes = 0;
    const limit = new Transform({ transform(chunk, encoding, callback) {
      bytes += chunk.length;
      callback(bytes > maxBytes ? new Error("Evidence exceeds the size limit.") : null, chunk);
    } });
    res.set({ "Cache-Control": "private, no-store", "Content-Type": mime[asset.format],
      "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename="support-evidence-${asset.evidenceId}.${asset.format}"` });
    await pipeline(stream, limit, res, { signal: controller.signal });
  } catch (error) {
    if (res.headersSent) { res.destroy(); return; }
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "Private evidence is temporarily unavailable.");
  } finally { clearTimeout(deadline); res.removeListener("close", closed); }
}
