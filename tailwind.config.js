// FILE: tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './*.js',
    './ui/**/*.js',       // picks up data-util.js renderers in subdirectories
    '!./node_modules/**',
    '!./api/**'
  ],
  safelist: [
    // Layout / animation utilities used programmatically
    'animate-pulse',
    'active-press',
    // ── Runtime orange tokens — added/removed by applyRadioSelectedStyles()
    //    in data-util.js at runtime; never appear as static strings in HTML
    'bg-orange-500',
    'border-orange-500',
    'text-white',          // paired with bg-orange-500 on selected labels
    'text-gray-700',       // default label text restored on deselect
    'border-gray-300',     // default label border restored on deselect
    'hover:bg-gray-50',    // hover state restored on deselect
    'bg-white',            // default label background restored on deselect
    // ── Star rating — applyStarSelectedStyles()
    'text-yellow-400',     // gold star fill
    'text-gray-300',       // unselected star
    // ── Followup checkbox panels — shown/hidden by JS
    'hidden',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
