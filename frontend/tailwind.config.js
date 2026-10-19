/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#24201F",
        plum: "#38302C",
        coral: "#A94F39",
        mango: "#C39453",
        cream: "#FAF8F5",
        sand: "#F1EDE8",
        sage: "#DCE8DC",
      },
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Manrope", "ui-sans-serif", "system-ui"],
        editorial: ["DM Serif Display", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 4px 24px rgba(36, 32, 31, 0.04)",
        lift: "0 12px 36px rgba(36, 32, 31, 0.09)",
      },
      backgroundImage: {
        "hero-glow": "radial-gradient(circle at 20% 20%, rgba(239,111,97,.22), transparent 32%), radial-gradient(circle at 80% 0%, rgba(255,255,255,.16), transparent 28%)",
      },
    },
  },
  plugins: [],
};
