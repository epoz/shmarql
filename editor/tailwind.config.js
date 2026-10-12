import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lodeon: {
          bg: "var(--lodeon-bg)",
          ink: "var(--lodeon-ink)",
          text: "var(--lodeon-text)",
          muted: "var(--lodeon-muted)",
          accent: "var(--lodeon-accent)",
          "accent-secondary": "var(--lodeon-accent-secondary)",
          panel: "var(--lodeon-panel)",
          surface: "var(--lodeon-surface)",
          canvas: "var(--lodeon-canvas)",
          control: "var(--lodeon-control)",
          border: "var(--lodeon-border)"
        }
      }
    }
  },
  plugins: [typography]
};
