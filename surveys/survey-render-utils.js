// FILE: surveys/survey-render-utils.js
// PURPOSE: Shared rendering and styling utilities for all survey data-utils.
// VERSION: 1.0.0
// AUTHORITY: Single source of truth for grid layout, style helpers,
//            auto-advance timer, and otherKey convention.
// RULE: No survey-specific logic here. Pure presentation utilities only.
//       All survey data-utils must use window.surveyRenderUtils —
//       never re-define these locally.

function getTextGridCols(n) {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 2;
  if (n === 5) return 3;
  if (n === 6) return 3;
  if (n === 7) return 3;
  if (n === 8) return 3;
  return 3;
}

function getGridMaxWidth(n, cols) {
  if (cols === 1)           return 'max-width:340px;margin-left:auto;margin-right:auto;';
  if (cols === 2 && n <= 4) return 'max-width:400px;margin-left:auto;margin-right:auto;';
  if (cols === 3 && n <= 3) return 'max-width:500px;margin-left:auto;margin-right:auto;';
  return '';
}

function applyRadioSelectedStyles(container) {
  container.querySelectorAll('label').forEach(label => {
    const input = document.getElementById(label.getAttribute('for'));
    if (!input) return;
    if (input.checked) {
      label.style.background  = 'var(--orange-light)';
      label.style.borderColor = 'var(--orange)';
      label.style.color       = 'var(--orange-dark)';
      label.style.borderWidth = '2px';
    } else {
      label.style.background  = '';
      label.style.borderColor = '';
      label.style.color       = '';
      label.style.borderWidth = '';
    }
  });
}

function applyChipSelectedStyle(label, isSelected) {
  if (isSelected) {
    label.style.background  = 'var(--orange-light)';
    label.style.borderColor = 'var(--orange)';
    label.style.color       = 'var(--orange-dark)';
    label.style.borderWidth = '2px';
  } else {
    label.style.background  = '';
    label.style.borderColor = '';
    label.style.color       = '';
    label.style.borderWidth = '';
  }
}

// CANONICAL version — includes star-label reset so star labels never
// inherit option-card border/background styles from parent containers.
// This resolves the silent divergence between data-util.js and shayona-data-util.js.
// The reset values (transparent/0) are additive — no visual change on temple star ratings.
function applyStarSelectedStyles(container, selectedValue) {
  container.querySelectorAll('label.star').forEach(label => {
    const input = document.getElementById(label.getAttribute('for'));
    if (!input) return;
    const starVal = parseInt(input.value, 10);
    const selVal  = parseInt(selectedValue, 10);
    if (starVal <= selVal) {
      label.classList.add('text-yellow-400');
      label.classList.remove('text-gray-300');
      label.style.color = '#FBBF24';
    } else {
      label.classList.remove('text-yellow-400');
      label.classList.add('text-gray-300');
      label.style.color = '#D1D5DB';
    }
    label.style.background  = 'transparent';
    label.style.borderColor = 'transparent';
    label.style.borderWidth = '0';
    label.style.boxShadow   = 'none';
    label.style.transform   = 'none';
  });
}

function otherKey(qName) {
  return `other_${qName}`;
}

// Returns an isolated auto-advance timer instance.
// Each data-util calls createAutoAdvanceTimer() once at module init
// and gets its own timer — no shared global state between survey types.
function createAutoAdvanceTimer() {
  let timer = null;
  return {
    schedule(callback, delay) {
      if (timer) {
        console.warn('[AUTO-ADVANCE] Cancelling existing timer');
        clearTimeout(timer);
      }
      timer = setTimeout(() => { timer = null; callback(); }, delay);
    },
    clear() {
      if (timer) { clearTimeout(timer); timer = null; }
    }
  };
}

window.surveyRenderUtils = {
  getTextGridCols,
  getGridMaxWidth,
  applyRadioSelectedStyles,
  applyChipSelectedStyle,
  applyStarSelectedStyles,
  otherKey,
  createAutoAdvanceTimer,
};

console.log('[survey-render-utils] ✅ Shared render utilities loaded (v1.0.0)');
