/** OmniCore design tokens — matches the mockups: dark surface, signal green */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "#0B0F0E", raised: "#121816", line: "#1E2A26" },
        signal:  { DEFAULT: "#2EE59D", dim: "#1A8A61" },
        warn: "#F5B841",
        danger: "#F0616D"
      }
    }
  },
  plugins: []
};
