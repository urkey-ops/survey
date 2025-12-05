/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html', 
    './*.js',
    '!./node_modules/**',
    '!./api/**'
  ],
  safelist: [
    'shake'
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
