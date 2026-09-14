/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#4A2148",
        plum: "#4A2148",
        coral: "#F26B5E",
        mango: "#F6B94A",
        cream: "#FFF9F2",
        sand: "#FFE1D6",
        sage: "#B8D8C0",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Manrope", "Inter", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        soft: "0 18px 50px rgba(74, 33, 72, 0.10)",
        lift: "0 22px 60px rgba(74, 33, 72, 0.16)",
      },
      backgroundImage: {
        "hero-glow": "radial-gradient(circle at 20% 20%, rgba(239,111,97,.22), transparent 32%), radial-gradient(circle at 80% 0%, rgba(255,255,255,.16), transparent 28%)",
      },
    },
  },
  plugins: [],
};
