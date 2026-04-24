// FILE: ui/validation.js
// PURPOSE: Form validation logic for survey questions
// VERSION: 2.5.0
// CHANGES FROM 2.4.0:
//   - ADD: section-header type — always passes (no user input, auto-advances)
//   - ADD: dual-star-rating type — validates both sub-ratings filled when required

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Companion key helper — must match data-util.js otherKey() exactly ────────
function otherKey(qName) {
  return (typeof window.dataUtils?.otherKey === 'function')
    ? window.dataUtils.otherKey(qName)
    : `other_${qName}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export function clearErrors() {
  document.querySelectorAll('.error-message').forEach(el => {
    el.textContent = '';
    el.classList.add('hidden');
  });
}

function displayError(elementId, message) {
  const errorEl = document.getElementById(elementId);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  } else {
    console.warn(`[VALIDATION] Missing error element for ID '${elementId}'`);
  }
}

/**
 * Core "is this answer empty?" check — handles ALL value types.
 *
 * Shape guide:
 *   emoji-radio / radio / textarea    → plain string
 *   number-scale / star-rating        → Number (0 is valid, never empty)
 *   checkbox-with-other               → string[]
 *   radio-with-other                  → { main, other }
 *   radio-with-followup               → { main, followup[] }
 *   selector-textarea                 → { category, text } — empty when BOTH blank
 *   dual-star-rating                  → { taste: number, value: number }
 */
function _isEmpty(answer, questionType) {
  if (answer === null || answer === undefined)  return true;
  if (typeof answer === 'string')               return answer.trim() === '';
  if (typeof answer === 'number')               return false; // 0 is a valid rating
  if (typeof answer === 'boolean')              return false;
  if (Array.isArray(answer))                    return answer.length === 0;

  if (typeof answer === 'object') {
    // selector-textarea stores { category, text }
    if (questionType === 'selector-textarea') {
      return !answer.text || String(answer.text).trim() === '';
    }
    // dual-star-rating stores { key1: number|null, key2: number|null }
    if (questionType === 'dual-star-rating') {
      return Object.values(answer).every(v => v === null || v === undefined);
    }
    // All other object shapes: { main, other } or { main, followup[] }
    return !answer.main || String(answer.main).trim() === '';
  }

  return false;
}

/**
 * Extract the main selection value from any stored answer shape.
 */
function _mainValue(answer) {
  if (answer === null || answer === undefined) return '';
  if (typeof answer === 'object' && !Array.isArray(answer)) return answer.main || '';
  return answer;
}

// ─────────────────────────────────────────────────────────────────────────────

export function validateQuestion(question, formData) {
  if (!question) {
    console.error('[VALIDATION] validateQuestion called with undefined question — check getQuestions() in core.js');
    return false;
  }

  clearErrors();

  const answer = formData[question.name];
  let isValid = true;
  let errorMessage = '';

  // ── SECTION HEADER ────────────────────────────────────────────────────────
  // No user input — always valid. Auto-advances on its own timer.
  if (question.type === 'section-header') {
    return true;
  }

  // ── DUAL STAR RATING ──────────────────────────────────────────────────────
  // answer shape: { taste: number|null, value: number|null }
  // Required: every sub-rating must be filled.
  else if (question.type === 'dual-star-rating') {
    if (question.required) {
      const allFilled = question.subRatings?.every(sub =>
        answer && answer[sub.key] !== null && answer[sub.key] !== undefined
      );
      if (!allFilled) {
        errorMessage = 'Please rate both options.';
        isValid = false;
      }
    }
  }

  // ── SELECTOR TEXTAREA ─────────────────────────────────────────────────────
  else if (question.type === 'selector-textarea') {
    if (question.required) {
      const txt = (answer && typeof answer === 'object') ? (answer.text || '') : '';
      if (!txt || String(txt).trim() === '') {
        errorMessage = 'Please write your response.';
        isValid = false;
      }
    }
    // Non-required: always passes
  }

  // ── CHECKBOX WITH OTHER ───────────────────────────────────────────────────
  else if (question.type === 'checkbox-with-other') {
    if (question.required && (!Array.isArray(answer) || answer.length === 0)) {
      errorMessage = 'Please select at least one option.';
      isValid = false;
    }

    if (isValid && Array.isArray(answer) && answer.includes('Other')) {
      const otherVal = formData[otherKey(question.name)] || '';
      if (!otherVal || String(otherVal).trim() === '') {
        displayError(`${question.id}Error`, 'Please specify your other answer.');
        isValid = false;
      }
    }
  }

  // ── RADIO WITH OTHER ──────────────────────────────────────────────────────
  else if (question.type === 'radio-with-other') {
    if (question.required && _isEmpty(answer, question.type)) {
      errorMessage = 'Please select an option.';
      isValid = false;
    }

    if (isValid) {
      const mainVal = _mainValue(answer);
      if (mainVal === 'Other') {
        const otherText = (answer && typeof answer === 'object')
          ? (answer.other || '')
          : (formData[otherKey(question.name)] || '');
        if (!otherText || String(otherText).trim() === '') {
          displayError(`${question.id}Error`, 'Please specify your answer.');
          isValid = false;
        }
      }
    }
  }

  // ── RADIO WITH FOLLOW-UP ──────────────────────────────────────────────────
  else if (question.type === 'radio-with-followup') {
    if (question.required && _isEmpty(answer, question.type)) {
      errorMessage = 'Please select an option.';
      isValid = false;
    }

    if (isValid) {
      const mainVal = _mainValue(answer);

      if (question.followupRequired && mainVal) {
        const selectedOpt = question.options?.find(o => o.value === mainVal);
        if (selectedOpt?.followupLabel && selectedOpt.followupOptions?.length > 0) {
          const followupArr = (answer && typeof answer === 'object' && Array.isArray(answer.followup))
            ? answer.followup
            : [];
          if (followupArr.length === 0) {
            displayError(`${question.id}Error`, 'Please answer the follow-up question.');
            isValid = false;
          }
        }
      }
    }
  }

  // ── CUSTOM CONTACT ────────────────────────────────────────────────────────
  else if (question.type === 'custom-contact') {
    const consent = formData['newsletterConsent'] === 'Yes';
    if (consent) {
      const name  = formData['name'];
      const email = formData['email'];
      if (!name || String(name).trim() === '') {
        displayError('nameError', 'Name is required for contact.');
        isValid = false;
      }
      if (!email || !emailRegex.test(email)) {
        displayError('emailError', 'Please enter a valid email address.');
        isValid = false;
      }
    }
  }

  // ── STAR RATING & NUMBER SCALE ────────────────────────────────────────────
  else if (question.type === 'star-rating' || question.type === 'number-scale') {
    if (question.required && (answer === null || answer === undefined)) {
      errorMessage = 'Please make a selection.';
      isValid = false;
    }
  }

  // ── ALL OTHER TYPES ───────────────────────────────────────────────────────
  else if (question.required && _isEmpty(answer, question.type)) {
    errorMessage = 'This response is required.';
    isValid = false;
  }

  if (!isValid && errorMessage) {
    displayError(`${question.id}Error`, errorMessage);
  }

  return isValid;
}

// ─────────────────────────────────────────────────────────────────────────────

export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return emailRegex.test(email.trim());
}

export function validateRequired(value) {
  return !_isEmpty(value);
}

export function validateArrayNotEmpty(arr) {
  return Array.isArray(arr) && arr.length > 0;
}

/**
 * Get all validation errors for a question (non-throwing, used by batch validate).
 */
export function getValidationErrors(question, formData) {
  if (!question) return ['Question definition missing.'];

  const errors  = [];
  const answer  = formData[question.name];
  const mainVal = _mainValue(answer);

  // ── section-header: never errors ─────────────────────────────────────────
  if (question.type === 'section-header') {
    return [];
  }

  // ── dual-star-rating ──────────────────────────────────────────────────────
  if (question.type === 'dual-star-rating') {
    if (question.required) {
      const allFilled = question.subRatings?.every(sub =>
        answer && answer[sub.key] !== null && answer[sub.key] !== undefined
      );
      if (!allFilled) errors.push('Please rate both options.');
    }
    return errors;
  }

  // ── selector-textarea ─────────────────────────────────────────────────────
  if (question.type === 'selector-textarea') {
    if (question.required) {
      const txt = (answer && typeof answer === 'object') ? (answer.text || '') : '';
      if (!txt || String(txt).trim() === '') {
        errors.push('Please write your response.');
      }
    }
    return errors;
  }

  // Required check — works for all remaining shapes via _isEmpty
  if (question.required && _isEmpty(answer, question.type)) {
    errors.push('This response is required.');
  }

  if (question.type === 'email' && answer && !validateEmail(answer)) {
    errors.push('Please enter a valid email address.');
  }

  // checkbox-with-other
  if (question.type === 'checkbox-with-other') {
    if (question.required && !validateArrayNotEmpty(answer)) {
      if (!errors.length) errors.push('Please select at least one option.');
    }
    if (Array.isArray(answer) && answer.includes('Other')) {
      const ov = formData[otherKey(question.name)] || '';
      if (!ov || String(ov).trim() === '') {
        errors.push('Please specify your other answer.');
      }
    }
  }

  // radio-with-other
  if (question.type === 'radio-with-other' && mainVal === 'Other') {
    const otherText = (answer && typeof answer === 'object')
      ? (answer.other || '')
      : (formData[otherKey(question.name)] || '');
    if (!otherText || String(otherText).trim() === '') {
      errors.push('Please specify your answer.');
    }
  }

  // radio-with-followup
  if (question.type === 'radio-with-followup' && question.followupRequired && mainVal) {
    const selectedOpt = question.options?.find(o => o.value === mainVal);
    if (selectedOpt?.followupLabel && selectedOpt.followupOptions?.length > 0) {
      const followupArr = (answer && typeof answer === 'object' && Array.isArray(answer.followup))
        ? answer.followup
        : [];
      if (followupArr.length === 0) {
        errors.push('Please answer the follow-up question.');
      }
    }
  }

  return errors;
}

export function validateMultipleQuestions(questions, formData) {
  const allErrors = {};
  let isValid = true;

  questions.forEach(question => {
    const errors = getValidationErrors(question, formData);
    if (errors.length > 0) {
      allErrors[question.id] = errors;
      isValid = false;
    }
  });

  return { isValid, errors: allErrors };
}

export const validationUtils = {
  emailRegex,
  validateEmail,
  validateRequired,
  validateArrayNotEmpty,
  getValidationErrors,
  validateMultipleQuestions,
};

// ── Expose on window so core.js goNext() can call without ES module import ───
window.validateQuestion = validateQuestion;
window.clearErrors      = clearErrors;

export default {
  validateQuestion,
  clearErrors,
  ...validationUtils,
};
