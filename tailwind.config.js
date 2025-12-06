// FILE: tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html', 
    './*.js',
    '!./node_modules/**',
    '!./api/**'
  ],
  safelist: [
  
    'animate-pulse',
    'active-press'
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
