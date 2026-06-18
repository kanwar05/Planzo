const pics = {
  dj: [
    "https://images.unsplash.com/photo-1598387993441-a364f854c3e1?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1571266028243-d220c9c3b2d2?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=900&q=80",
  ],
  catering: [
    "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
  ],
  decoration: [
    "https://images.unsplash.com/photo-1507504031003-b417219a0fde?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=900&q=80",
  ],
  planner: [
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1507504031003-b417219a0fde?auto=format&fit=crop&w=900&q=80",
  ],
};

const make = (id, name, type, rating, experience, price, location, image, featured = false) => ({
  id, name, type, rating, experience, price, location, image, featured,
  reviews: Math.floor(rating * 37 + id * 3),
  description: `${name} brings creative direction, reliable coordination and a polished guest experience to every celebration.`,
});

export const vendors = [
  make(1, "DJ Armaan Live", "DJ", 4.9, 9, "₹35,000 – ₹85,000", "New Delhi", pics.dj[0], true),
  make(2, "Bassline by Rhea", "DJ", 4.8, 7, "₹28,000 – ₹70,000", "Mumbai", pics.dj[1]),
  make(3, "The Rhythm Project", "DJ", 4.7, 6, "₹25,000 – ₹60,000", "Bengaluru", pics.dj[2]),
  make(4, "DJ Kabir & Co.", "DJ", 4.9, 11, "₹45,000 – ₹1,10,000", "Jaipur", pics.dj[1], true),
  make(5, "Neon Nights Audio", "DJ", 4.6, 5, "₹20,000 – ₹55,000", "Chandigarh", pics.dj[0]),
  make(6, "Saffron Table", "Catering", 4.9, 14, "₹1,200 – ₹2,800/plate", "New Delhi", pics.catering[0], true),
  make(7, "The Plated Story", "Catering", 4.8, 10, "₹1,000 – ₹2,400/plate", "Mumbai", pics.catering[1]),
  make(8, "Feast & Fable", "Catering", 4.7, 8, "₹900 – ₹2,000/plate", "Bengaluru", pics.catering[2]),
  make(9, "Royal Rasoi Co.", "Catering", 4.8, 16, "₹1,100 – ₹2,500/plate", "Jaipur", pics.catering[0]),
  make(10, "Olive & Ember", "Catering", 4.6, 6, "₹850 – ₹1,900/plate", "Pune", pics.catering[1]),
  make(11, "Velvet Petal Decor", "Decoration", 4.9, 12, "₹80,000 – ₹3,50,000", "Mumbai", pics.decoration[0], true),
  make(12, "Marigold Moments", "Decoration", 4.8, 9, "₹65,000 – ₹2,80,000", "New Delhi", pics.decoration[1]),
  make(13, "Studio Fern", "Decoration", 4.7, 7, "₹55,000 – ₹2,20,000", "Bengaluru", pics.decoration[2]),
  make(14, "House of Festoon", "Decoration", 4.9, 13, "₹95,000 – ₹4,00,000", "Jaipur", pics.decoration[0]),
  make(15, "Bloom Theory Events", "Decoration", 4.6, 5, "₹45,000 – ₹1,80,000", "Hyderabad", pics.decoration[1]),
  make(16, "Juniper Events", "Event Planner", 4.9, 11, "₹1,25,000 – ₹5,00,000", "New Delhi", pics.planner[0], true),
  make(17, "The Celebration Office", "Event Planner", 4.8, 9, "₹1,00,000 – ₹4,20,000", "Mumbai", pics.planner[1]),
  make(18, "Gather & Glow", "Event Planner", 4.7, 7, "₹85,000 – ₹3,50,000", "Bengaluru", pics.planner[2]),
  make(19, "Shaadi Alchemy", "Event Planner", 4.9, 15, "₹1,50,000 – ₹6,00,000", "Jaipur", pics.planner[0]),
  make(20, "Mosaic Event Studio", "Event Planner", 4.6, 6, "₹75,000 – ₹3,00,000", "Pune", pics.planner[1]),
];

export const locations = [...new Set(vendors.map((vendor) => vendor.location))];
export const categories = [...new Set(vendors.map((vendor) => vendor.type))];
