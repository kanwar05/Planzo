import celebrationImage from "../assets/planzo-hero-event.jpg";
import cateringImage from "../assets/services/catering.jpg";
import venueImage from "../assets/services/venue.jpg";
import djImage from "../assets/services/dj.jpg";
import decorationImage from "../assets/services/decoration.jpg";
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
