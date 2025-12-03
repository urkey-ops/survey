// FILE: tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  // UPDATED: Definitive content configuration array with necessary exclusions
  content: [
    './**/*.html', 
    './**/*.js', 
    '!./node_modules/**', // EXCLUSION: Fixes 10-second build time
    '!./api/**'          // EXCLUSION: Excludes JS in the API folder
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
