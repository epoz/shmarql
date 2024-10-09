/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["../shmarql/**/*.py"],
  theme: {
    extend: {
      screens: {
        widescreen: { raw: "(min-aspect-ratio: 3/2)" },
        tallscreen: { raw: "(min-aspect-ratio: 1/2)" },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
