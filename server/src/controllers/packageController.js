import Vendor from "../models/Vendor.js";
import VendorPackage from "../models/VendorPackage.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { validateObjectId } from "../utils/validation.js";
import { assertVerifiedEmail } from "../utils/emailVerification.js";
import { lockAccountForBooking, lockVendorForBooking, withBookingTransaction } from "../utils/vendorBookingTransaction.js";
import { hasActiveVendorOwner } from "../services/vendorSearchService.js";
import { packageCreationIdentity, packageRevision, packageView, validatePackageInput } from "../services/packageService.js";

async function ownedVendor(userId, session = null) {
  const vendor = await Vendor.findOne({ userId }).session(session);
  if (!vendor) throw new ApiError(404, "Create a vendor profile before managing packages.");
  return vendor;
}

async function lockVerifiedOwner(actor, session) {
  const current = await lockAccountForBooking(actor._id, session);
  if ((current.authVersion || 0) !== (actor.authVersion || 0))
    throw new ApiError(401, "Your account changed. Please log in again.");
  assertVerifiedEmail(current);
}

export const getPublicPackages = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");
  const vendor = await Vendor.findById(req.params.vendorId);
  if (!(await hasActiveVendorOwner(vendor))) throw new ApiError(404, "Vendor not found.");
  const items = await VendorPackage.find({ vendorId: vendor._id, active: true, serviceCategory: vendor.serviceCategory })
    .sort({ createdAt: -1, _id: -1 }).limit(100);
  res.json({ success: true, packages: items.map(packageView) });
});

export const getMyPackages = asyncHandler(async (req, res) => {
  const vendor = await ownedVendor(req.user._id);
  const items = await VendorPackage.find({ vendorId: vendor._id }).sort({ createdAt: -1, _id: -1 }).limit(100);
  res.set("Cache-Control", "no-store").json({ success: true, packages: items.map(packageView) });
});

export const createPackage = asyncHandler(async (req, res) => {
  const result = await withBookingTransaction(async session => {
    await lockVerifiedOwner(req.user, session);
    const ownerVendor = await ownedVendor(req.user._id, session);
    const vendor = await lockVendorForBooking(ownerVendor._id, session, req.user._id);
    const data = validatePackageInput(req.body, vendor, { enforceCategory: false });
    const identity = packageCreationIdentity(req.headers["idempotency-key"], data);
    if (identity) {
      const existing = await VendorPackage.findOne({ vendorId: vendor._id, creationKeyHash: identity.creationKeyHash }).select("+creationRequestHash").session(session);
      if (existing) {
        if (existing.creationRequestHash !== identity.creationRequestHash) throw new ApiError(409, "This Idempotency-Key was already used for different package data.");
        return { item: existing, replayed: true };
      }
    }
    if (data.serviceCategory !== vendor.serviceCategory)
      throw new ApiError(400, "Package category must match your vendor profile.");
    if (await VendorPackage.countDocuments({ vendorId: vendor._id }).session(session) >= 100)
      throw new ApiError(409, "A vendor can manage at most 100 packages.");
    const [item] = await VendorPackage.create([{ ...data, vendorId: vendor._id, ...identity }], { session });
    return { item, replayed: false };
  });
  res.status(result.replayed ? 200 : 201).json({ success: true, message: "Package saved.", package: packageView(result.item) });
});

function updatePackage(deactivate = false) {
  return asyncHandler(async (req, res) => {
    validateObjectId(req.params.packageId, "package id");
    const revision = packageRevision(req.body?.revision);
    const item = await withBookingTransaction(async session => {
      await lockVerifiedOwner(req.user, session);
      const ownerVendor = await ownedVendor(req.user._id, session);
      const vendor = await lockVendorForBooking(ownerVendor._id, session, req.user._id);
      const existing = await VendorPackage.findOne({ _id: req.params.packageId, vendorId: vendor._id }).session(session);
      if (!existing) throw new ApiError(404, "Package not found.");
      const changes = deactivate ? { active: false } : validatePackageInput(req.body, vendor, { partial: true });
      // Category changes on the vendor profile leave old packages unavailable
      // until the owner explicitly reclassifies them to the current category.
      if (changes.active === true && (changes.serviceCategory || existing.serviceCategory) !== vendor.serviceCategory)
        throw new ApiError(409, "Update the package category before activating it.");
      const updated = await VendorPackage.findOneAndUpdate({ _id: existing._id, vendorId: vendor._id, revision },
        { $set: changes, $inc: { revision: 1 } }, { new: true, runValidators: true, session });
      if (!updated) throw new ApiError(409, "The package changed. Reload it before saving.");
      return updated;
    });
    res.json({ success: true, message: deactivate ? "Package deactivated." : "Package saved.", package: packageView(item) });
  });
}
export const editPackage = updatePackage();
export const deactivatePackage = updatePackage(true);
