import celebrationImage from "../assets/optimized/luxury_wedding_editorial_1788675454322.webp";
import cateringImage from "../assets/optimized/catering.webp";
import venueImage from "../assets/optimized/venue.webp";
import djImage from "../assets/optimized/dj.webp";
import decorationImage from "../assets/optimized/decoration.webp";
const fallbacks = {
  DJ: djImage,
  Catering: cateringImage,
  Decoration: decorationImage,
  "Venue Booking": venueImage
};
const getImageUrl = image => {
  const url = typeof image === "string" ? image : image?.url;
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : "";
};
export const getVendorImage = vendor => getImageUrl(vendor?.profileImage) || getImageUrl(vendor?.portfolioImages?.[0]) || getImageUrl(vendor?.coverImage) || fallbacks[vendor?.serviceCategory] || celebrationImage;
export const getVendorGallery = vendor => [getImageUrl(vendor?.coverImage), ...(vendor?.portfolioImages?.map(getImageUrl) || []), getImageUrl(vendor?.profileImage)].filter((url, index, collection) => url && collection.indexOf(url) === index);
export const vendorProfileFields = {
  businessName: "Business name", serviceCategory: "Category", description: "Business description",
  location: "Service location", pricing: "Starting price"
};
export const getVendorCompletion = vendor => {
  const missingFields = Object.keys(vendorProfileFields).filter(key => key === "pricing"
    ? vendor?.pricing === "" || vendor?.pricing === undefined || vendor?.pricing === null || !Number.isFinite(Number(vendor.pricing)) || Number(vendor.pricing) < 0
    : !String(vendor?.[key] || "").trim());
  return { percent: (5 - missingFields.length) * 20, readyForReview: !missingFields.length, missingFields };
};
