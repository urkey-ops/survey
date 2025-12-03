// FILE: tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  // UPDATED: Corrected syntax to fix the glob warning AND explicitly exclude node_modules to fix the performance warning.
  content: [
    './**/*.html', // Corrected from ./**/*.{html}
    './**/*.js', 
    '!./node_modules/**' // Explicitly exclude node_modules
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
