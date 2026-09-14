import {
  Building2,
  ChefHat,
  Disc3,
  Flower2,
  HandHeart,
  PartyPopper,
  Armchair,
} from "lucide-react";
import venueImage from "../assets/services/punjab_heritage_venue.jpg";
import cateringImage from "../assets/services/tablescape_details_macro_1788675492844.jpg";
import djImage from "../assets/services/mohali_dj_night.jpg";
import decorationImage from "../assets/services/corporate_brand_gala_1788675512204.jpg";
import mehndiImage from "../assets/services/mehndi-artist.jpg";
import plannerImage from "../assets/services/editorial_hero_event_1788675428596.jpg";
import rentalImage from "../assets/services/event_build_day.jpg";

export const services = [
  { title: "Venue Booking", slug: "venue", description: "Distinctive spaces for celebrations of every size.", icon: Building2, image: venueImage },
  { title: "Catering", slug: "catering", description: "Thoughtful menus served with impeccable hospitality.", icon: ChefHat, image: cateringImage },
  { title: "DJ", slug: "dj", description: "Crowd-reading artists who keep your dance floor alive.", icon: Disc3, image: djImage },
  { title: "Decoration", slug: "decoration", description: "Beautiful concepts transformed into unforgettable spaces.", icon: Flower2, image: decorationImage },
  { title: "Mehndi Artist", slug: "mehndi", description: "Intricate bridal mehndi and contemporary henna artistry.", icon: HandHeart, image: mehndiImage },
  { title: "Event Planner", slug: "planner", description: "Calm, capable experts handling every moving detail.", icon: PartyPopper, image: plannerImage },
  { title: "Rental Services", slug: "rental", description: "Furniture, lighting and essentials, delivered on time.", icon: Armchair, image: rentalImage },
];
