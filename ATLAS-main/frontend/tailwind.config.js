export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["Inter", "system-ui", "sans-serif"],
        display: ["Sora", "sans-serif"],
        mono:    ["IBM Plex Mono", "monospace"],
      },
      colors: {
        bg:      "#E7ECF3",
        surface: "#EAEFF6",
        ink:     "#1D2436",
        muted:   "#6E7890",
        accent:  "#3457D8",
        danger:  "#DD3E46",
        warning: "#DE8B2C",
        success: "#1E9E71",
        info:    "#0EA5B7",
      },
    },
  },
  plugins: [],
};
