/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
        },
      },
      keyframes: {
        scan: {
          "0%, 100%": { top: "10%" },
          "50%": { top: "85%" },
        },
      },
      animation: {
        scan: "scan 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
