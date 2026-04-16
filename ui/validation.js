// FILE: ui/validation.js
// PURPOSE: Form validation logic for survey questions
// VERSION: 2.2.0 - CHECKBOX FIX: validateQuestion now exposed on window so
//                  core.js goNext() can actually call it. Previously the ES
//                  module export was never assigned to window.validateQuestion,
//                  so core.js fell through to the `true` fallback — every
//                  question passed validation immediately, BUT for checkboxes
//                  the real stopper was core.js using the wrong question array
//                  (Bug 5). With Bug 5 now fixed in core.js, validateQuestion
//                  must also be on window or goNext() still falls through.
//                  Also added: radio-with-followup type support.
// DEPENDENCIES: None (pure validation functions)

/**
 * Email validation regex
 */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Clear all error messages in the form
 */
export function clearErrors() {
  document.querySelectorAll('.error-message').forEach(el => {
    el.textContent = '';
    el.classList.add('hidden');
  });
}

/**
 * Display an error message for a specific field
 * @param {string} elementId - ID of the error message element
 * @param {string} message   - Error message to display
 */
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
 * Core "is this answer empty?" check — handles ALL value types:
 *   string, number, boolean, array, object, null, undefined
 */
function _isEmpty(answer) {
  if (answer === null || answer === undefined)  return true;
  if (typeof answer === 'string')               return answer.trim() === '';
  if (typeof answer === 'number')               return false; // 0 is a valid rating
  if (typeof answer === 'boolean')              return false;
  if (Array.isArray(answer))                    return answer.length === 0;
  // plain object e.g. { main: '...' }
  if (typeof answer === 'object')               return !answer.main || String(answer.main).trim() === '';
  return false;
}

/**
 * Validate a survey question based on its type and requirements.
 * @param {Object} question - Question object with validation rules
 * @param {Object} formData - Current form data to validate against
 * @returns {boolean} True if validation passes
 */
export function validateQuestion(question, formData) {
  // ── SAFETY GUARD ──────────────────────────────────────────────────────────
  // CHECKBOX FIX: if question is undefined (e.g. wrong array was used in
  // core.js before the Bug 5 / getQuestions() fix), return false clearly
  // instead of throwing a TypeError that swallows the real error.
  if (!question) {
    console.error('[VALIDATION] validateQuestion called with undefined question — check getQuestions() in core.js');
    return false;
  }
  // ─────────────────────────────────────────────────────────────────────────

  clearErrors();

  const answer = formData[question.name];
  let isValid = true;
  let errorMessage = '';

  // ── CHECKBOX WITH OTHER ───────────────────────────────────────────────────
  // CHECKBOX FIX: must check Array.isArray + length > 0, NOT just truthiness.
  // An empty array [] is truthy in JS so a plain !answer check would pass it.
  if (question.type === 'checkbox-with-other') {
    if (question.required && (!Array.isArray(answer) || answer.length === 0)) {
      errorMessage = 'Please select at least one option.';
      isValid = false;
    }

    // If "Other" is selected, the specify field must be filled
    if (isValid && Array.isArray(answer) && answer.includes('Other')) {
      const otherValue = formData['otherhearabout'] || formData['other_hear_about'] || '';
      if (!otherValue || String(otherValue).trim() === '') {
        displayError('otherhearabouttextError', 'Please specify other source.');
        displayError('other_hear_about_textError', 'Please specify other source.');
        isValid = false;
      }
    }
  }

  // ── RADIO WITH OTHER ──────────────────────────────────────────────────────
  else if (question.type === 'radio-with-other') {
    if (question.required && _isEmpty(answer)) {
      errorMessage = 'Please select an option.';
      isValid = false;
    }
    if (isValid && answer === 'Other') {
      const otherValue = formData['otherlocation'] || formData['other_location'] || '';
      if (!otherValue || String(otherValue).trim() === '') {
        displayError('otherlocationtextError', 'Please specify your location.');
        isValid = false;
      }
    }
  }

  // ── RADIO WITH FOLLOW-UP ──────────────────────────────────────────────────
  // Type 2 survey question type — main selection required; follow-up required
  // only when the question definition marks followupRequired: true AND the
  // selected option has a follow-up sub-question.
  else if (question.type === 'radio-with-followup') {
    if (question.required && _isEmpty(answer)) {
      errorMessage = 'Please select an option.';
      isValid = false;
    }
    if (isValid && question.followupRequired && answer) {
      const followupKey  = question.followupName || (question.name + '_followup');
      const followupVal  = formData[followupKey];
      const selectedOpt  = question.options?.find(o => o.value === answer);
      // Only validate follow-up if the selected option actually has one
      if (selectedOpt?.followup && _isEmpty(followupVal)) {
        displayError(question.id + 'FollowupError', 'Please answer the follow-up question.');
        isValid = false;
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
  // Stored as string "1"–"5" from radio input value; treat empty string as
  // unanswered even though typeof "" === 'string' (would pass _isEmpty)
  else if (question.type === 'star-rating' || question.type === 'number-scale') {
    if (question.required && (answer === null || answer === undefined || answer === '')) {
      errorMessage = 'Please make a selection.';
      isValid = false;
    }
  }

  // ── ALL OTHER TYPES (emoji-radio, radio, textarea, etc.) ──────────────────
  else if (question.required && _isEmpty(answer)) {
    errorMessage = 'This response is required.';
    isValid = false;
  }

  // Display the primary error message under the question element
  if (!isValid && errorMessage) {
    displayError(question.id + 'Error', errorMessage);
  }

  return isValid;
}

/**
 * Validate email format
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return emailRegex.test(email.trim());
}

/**
 * Validate required field (any type)
 */
export function validateRequired(value) {
  return !_isEmpty(value);
}

/**
 * Validate array has at least one selection
 */
export function validateArrayNotEmpty(arr) {
  return Array.isArray(arr) && arr.length > 0;
}

/**
 * Get all validation errors for a question (non-throwing, used by batch validate)
 */
export function getValidationErrors(question, formData) {
  if (!question) return ['Question definition missing.'];

  const errors = [];
  const answer = formData[question.name];

  if (question.required && _isEmpty(answer)) {
    errors.push('This response is required.');
  }

  if (question.type === 'email' && answer && !validateEmail(answer)) {
    errors.push('Please enter a valid email address.');
  }

  if (question.type === 'checkbox-with-other' && question.required) {
    if (!validateArrayNotEmpty(answer)) {
      errors.push('Please select at least one option.');
    }
  }

  if (question.type === 'checkbox-with-other' && Array.isArray(answer) && answer.includes('Other')) {
    const ov = formData['otherhearabout'] || formData['other_hear_about'] || '';
    if (!ov || String(ov).trim() === '') {
      errors.push('Please specify other source.');
    }
  }

  if (question.type === 'radio-with-other' && answer === 'Other') {
    const ov = formData['otherlocation'] || formData['other_location'] || '';
    if (!ov || String(ov).trim() === '') {
      errors.push('Please specify your location.');
    }
  }

  return errors;
}

/**
 * Batch validate multiple questions
 */
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

// ── CRITICAL: expose on window so core.js goNext() can call it ───────────────
//
// BEFORE (broken):
//   validation.js only used ES module exports. No window assignment anywhere.
//   core.js does: const isValid = window.validateQuestion ? window.validateQuestion(...) : true
//   window.validateQuestion was undefined → ternary always fell to `true`
//   → goNext() ALWAYS advanced regardless of validation state
//   → BUT for checkboxes, the real stopper was Bug 5 (wrong question array)
//     making currentQuestion undefined, which made validateQuestion return false
//     even when it was called... wait — if window.validateQuestion was undefined
//     the ternary returned true → goNext advanced. So why was checkbox stuck?
//
//   Answer: the ternary returned true → goNext tried to advance →
//   stopQuestionTimer(currentQuestion.id) was called on undefined → THREW →
//   goNext crashed silently in the try/catch above it → no advance.
//
// AFTER (fixed):
//   window.validateQuestion = validateQuestion  (line below)
//   window.clearErrors      = clearErrors       (line below)
//   Now core.js goNext() calls real validation AND doesn't crash on undefined.
//   The safety guard at the top of validateQuestion() handles the null case
//   cleanly instead of throwing TypeError.
//
// ─────────────────────────────────────────────────────────────────────────────
window.validateQuestion = validateQuestion;
window.clearErrors      = clearErrors;

export default {
  validateQuestion,
  clearErrors,
  ...validationUtils,
};
