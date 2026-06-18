/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#24172a",
        plum: "#57214f",
        coral: "#ef6f61",
        cream: "#fffaf5",
        sand: "#f2e9df",
        sage: "#748c75",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Manrope", "Inter", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        soft: "0 18px 50px rgba(49, 25, 51, 0.10)",
        lift: "0 22px 60px rgba(49, 25, 51, 0.16)",
      },
      backgroundImage: {
        "hero-glow": "radial-gradient(circle at 20% 20%, rgba(239,111,97,.22), transparent 32%), radial-gradient(circle at 80% 0%, rgba(255,255,255,.16), transparent 28%)",
      },
    },
  },
  plugins: [],
};
