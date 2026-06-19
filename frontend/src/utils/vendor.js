const FALLBACK_IMAGES = {
  DJ: "https://images.unsplash.com/photo-1598387993441-a364f854c3e1?auto=format&fit=crop&w=1200&q=80",
  Catering:
    "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1200&q=80",
  Decoration:
    "https://images.unsplash.com/photo-1507504031003-b417219a0fde?auto=format&fit=crop&w=1200&q=80",
  "Event Planner":
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80",
  "Venue Booking":
    "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=80",
};

export const getVendorImage = (vendor) =>
  vendor?.portfolioImages?.[0] ||
  FALLBACK_IMAGES[vendor?.serviceCategory] ||
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80";

export const getVendorGallery = (vendor) => {
  const images = vendor?.portfolioImages?.filter(Boolean) || [];
  return images.length ? images : [getVendorImage(vendor)];
};
