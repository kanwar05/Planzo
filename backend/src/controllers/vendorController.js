import Vendor from "../models/Vendor.js";

export async function getVendors(req, res, next) {
  try {
    const { category, location, search } = req.query;
    const filters = {};

    if (category) filters.serviceCategory = category;
    if (location) filters.location = new RegExp(location, "i");
    if (search) {
      filters.$or = [
        { businessName: new RegExp(search, "i") },
        { serviceCategory: new RegExp(search, "i") },
        { location: new RegExp(search, "i") },
      ];
    }

    const vendors = await Vendor.find(filters).sort({ rating: -1, createdAt: -1 });
    res.json({ success: true, count: vendors.length, vendors });
  } catch (error) {
    next(error);
  }
}

export async function getVendor(req, res, next) {
  try {
    const vendor = await Vendor.findById(req.params.id).populate("owner", "name email phone");
    if (!vendor) {
      res.status(404);
      throw new Error("Vendor not found.");
    }
    res.json({ success: true, vendor });
  } catch (error) {
    next(error);
  }
}

export async function saveVendorProfile(req, res, next) {
  try {
    const vendor = await Vendor.findOneAndUpdate(
      { owner: req.user._id },
      { ...req.body, owner: req.user._id },
      { new: true, upsert: true, runValidators: true },
    );
    res.status(201).json({ success: true, vendor });
  } catch (error) {
    next(error);
  }
}

