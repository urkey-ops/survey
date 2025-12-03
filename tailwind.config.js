// FILE: tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  // UPDATED: Use an array for content to allow explicit exclusion
  content: [
    './**/*.{html}', 
    './**/*.js', 
    '!./node_modules/**' // This line explicitly excludes the node_modules folder
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
