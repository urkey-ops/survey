// FILE: tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html', 
    './*.js',
    '!./node_modules/**',
    '!./api/**'
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
