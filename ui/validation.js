// FILE: ui/validation.js
// PURPOSE: Form validation logic for survey questions
// VERSION: 2.3.0
// CHANGES FROM 2.2.0:
//   - radio-with-other: validates against { main, other } object shape
//     (was checking answer === 'Other' on a string — never matched object)
//   - radio-with-followup: validates against { main, followup[] } object shape
//     (was checking answer directly as string or using followupName key)
//   - checkbox-with-other: uses otherKey(q.name) from dataUtils (was hardcoded
//     'otherhearabout' / 'other_hear_about' — brittle, breaks other questions)
//   - star-rating / number-scale: accepts Number type (data-util now stores Number)
//   - getValidationErrors: same shape fixes applied for batch validation
//   - All hardcoded fallback key strings removed — single source of truth via
//     window.dataUtils.otherKey()

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Companion key helper — must match data-util.js otherKey() exactly ────────
// We call through window.dataUtils so there is one source of truth.
// Falls back to inline formula if dataUtils not yet loaded (defensive).
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
 * For { main, other } and { main, followup[] } objects, empty means no main.
 * For Number, 0 is valid (never empty).
 */
function _isEmpty(answer) {
  if (answer === null || answer === undefined)  return true;
  if (typeof answer === 'string')               return answer.trim() === '';
  if (typeof answer === 'number')               return false; // 0 is a valid rating
  if (typeof answer === 'boolean')              return false;
  if (Array.isArray(answer))                    return answer.length === 0;
  // Object shape: { main, other } or { main, followup[] }
  if (typeof answer === 'object')               return !answer.main || String(answer.main).trim() === '';
  return false;
}

/**
 * Extract the main selection value from any stored answer shape.
 * Handles: plain string, number, { main, ... } object.
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

  // ── CHECKBOX WITH OTHER ───────────────────────────────────────────────────
  if (question.type === 'checkbox-with-other') {
    if (question.required && (!Array.isArray(answer) || answer.length === 0)) {
      errorMessage = 'Please select at least one option.';
      isValid = false;
    }

    // If "Other" is in the selection, the specify field must be filled
    if (isValid && Array.isArray(answer) && answer.includes('Other')) {
      const otherVal = formData[otherKey(question.name)] || '';
      if (!otherVal || String(otherVal).trim() === '') {
        displayError(`${question.id}Error`, 'Please specify your other answer.');
        isValid = false;
      }
    }
  }

  // ── RADIO WITH OTHER ──────────────────────────────────────────────────────
  // answer shape: { main: string, other: string }
  else if (question.type === 'radio-with-other') {
    if (question.required && _isEmpty(answer)) {
      errorMessage = 'Please select an option.';
      isValid = false;
    }

    if (isValid) {
      const mainVal = _mainValue(answer);
      if (mainVal === 'Other') {
        // other text lives inside the object itself (set by data-util)
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
  // answer shape: { main: string, followup: string[] }
  else if (question.type === 'radio-with-followup') {
    if (question.required && _isEmpty(answer)) {
      errorMessage = 'Please select an option.';
      isValid = false;
    }

    if (isValid) {
      const mainVal = _mainValue(answer);

      // Only validate follow-up if the question definition requires it
      // AND the selected option actually has follow-up options
      if (question.followupRequired && mainVal) {
        const selectedOpt = question.options?.find(o => o.value === mainVal);
        if (selectedOpt?.followupLabel && selectedOpt.followupOptions?.length > 0) {
          // followup array lives inside the object (set by data-util)
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
  // data-util now stores these as Number — null/undefined means unanswered.
  // 0 would be a valid number so we check explicitly for null/undefined only.
  else if (question.type === 'star-rating' || question.type === 'number-scale') {
    if (question.required && (answer === null || answer === undefined)) {
      errorMessage = 'Please make a selection.';
      isValid = false;
    }
  }

  // ── ALL OTHER TYPES (emoji-radio, radio, textarea, etc.) ──────────────────
  else if (question.required && _isEmpty(answer)) {
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
 * Mirrors the same shape-aware logic as validateQuestion().
 */
export function getValidationErrors(question, formData) {
  if (!question) return ['Question definition missing.'];

  const errors  = [];
  const answer  = formData[question.name];
  const mainVal = _mainValue(answer);

  // Required check — works for all shapes via _isEmpty
  if (question.required && _isEmpty(answer)) {
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

  // radio-with-other — other text lives in answer.other
  if (question.type === 'radio-with-other' && mainVal === 'Other') {
    const otherText = (answer && typeof answer === 'object')
      ? (answer.other || '')
      : (formData[otherKey(question.name)] || '');
    if (!otherText || String(otherText).trim() === '') {
      errors.push('Please specify your answer.');
    }
  }

  // radio-with-followup — followup lives in answer.followup[]
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
