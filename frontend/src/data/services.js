import rentalSmall from "../assets/optimized/event_build_day-small.webp";
import plannerSmall from "../assets/optimized/editorial_hero_event_1788675428596-small.webp";
import mehndiSmall from "../assets/optimized/mehndi-artist-small.webp";
import decorationSmall from "../assets/optimized/corporate_brand_gala_1788675512204-small.webp";
import djSmall from "../assets/optimized/mohali_dj_night-small.webp";
import cateringSmall from "../assets/optimized/tablescape_details_macro_1788675492844-small.webp";
import venueSmall from "../assets/optimized/punjab_heritage_venue-small.webp";
import {
  Building2,
  ChefHat,
  Disc3,
  Flower2,
  HandHeart,
  PartyPopper,
  Armchair,
  Camera,
} from "lucide-react";
import venueImage from "../assets/optimized/punjab_heritage_venue.webp";
import cateringImage from "../assets/optimized/tablescape_details_macro_1788675492844.webp";
import djImage from "../assets/optimized/mohali_dj_night.webp";
import decorationImage from "../assets/optimized/corporate_brand_gala_1788675512204.webp";
import mehndiImage from "../assets/optimized/mehndi-artist.webp";
import plannerImage from "../assets/optimized/editorial_hero_event_1788675428596.webp";
import rentalImage from "../assets/optimized/event_build_day.webp";
import photographyImage from "../assets/optimized/luxury_wedding_editorial_1788675454322.webp";
import photographySmall from "../assets/optimized/luxury_wedding_editorial_1788675454322-small.webp";

export const services = [
  { title: "Venue Booking", slug: "venue", description: "Distinctive spaces for celebrations of every size.", icon: Building2, image: venueImage, imageSmall: venueSmall },
  { title: "Catering", slug: "catering", description: "Thoughtful menus served with impeccable hospitality.", icon: ChefHat, image: cateringImage, imageSmall: cateringSmall },
  { title: "DJ", slug: "dj", description: "Crowd-reading artists who keep your dance floor alive.", icon: Disc3, image: djImage, imageSmall: djSmall },
  { title: "Decoration", slug: "decoration", description: "Beautiful concepts transformed into unforgettable spaces.", icon: Flower2, image: decorationImage, imageSmall: decorationSmall },
  { title: "Mehndi Artist", slug: "mehndi", description: "Intricate bridal mehndi and contemporary henna artistry.", icon: HandHeart, image: mehndiImage, imageSmall: mehndiSmall },
  { title: "Event Planner", slug: "planner", description: "Calm, capable experts handling every moving detail.", icon: PartyPopper, image: plannerImage, imageSmall: plannerSmall },
  { title: "Rental Services", slug: "rental", description: "Furniture, lighting and essentials, delivered on time.", icon: Armchair, image: rentalImage, imageSmall: rentalSmall },
  { title: "Photographer", slug: "photographer", description: "Thoughtful photographs that preserve the moments that matter.", icon: Camera, image: photographyImage, imageSmall: photographySmall },
];
