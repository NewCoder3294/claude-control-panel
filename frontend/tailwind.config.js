/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light monochrome admin palette.
        // The legacy `ink-*` ramp is remapped light: low numbers are the
        // lightest canvas/surfaces, higher numbers step toward borders.
        ink: {
          950: "#f8f8f8", // page canvas
          900: "#ffffff", // surface / sidebar
          850: "#ffffff", // cards
          800: "#fafafa", // header / hover wash
          750: "#f1f1f1", // active nav background
          700: "#e5e5e5", // border
          600: "#e0e0e0", // strong border
          500: "#c4c4c4", // scrollbar hover
        },
        // The legacy `fog-*` text ramp is remapped: low numbers are the
        // darkest (primary) text, higher numbers fade to muted.
        fog: {
          50: "#1f1f1f", // text primary
          100: "#1f1f1f", // text primary
          200: "#3a3a3a",
          300: "#4a4a4a",
          400: "#6b6b6b", // text secondary
          500: "#9a9a9a", // text muted
          600: "#b3b3b3", // text faint
        },
        accent: {
          DEFAULT: "#1a1a1a", // near-black primary action
          muted: "#6b6b6b",
        },
        // Status colors — used sparingly as small dots / text / badges.
        status: {
          ok: "#1f9d57",
          warn: "#b7791f",
          fail: "#d64545",
          info: "#2563eb",
          off: "#9a9a9a",
        },
        // Clear semantic aliases for new work.
        canvas: "#f8f8f8",
        surface: "#ffffff",
        "border-subtle": "#e5e5e5",
        "border-hairline": "#f0f0f0",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        display: [
          "Space Grotesk",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SF Mono",
          "JetBrains Mono",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        panel: "0 1px 2px 0 rgba(0,0,0,0.04), 0 1px 3px 0 rgba(0,0,0,0.04)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(2px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
      },
    },
  },
  plugins: [],
};
