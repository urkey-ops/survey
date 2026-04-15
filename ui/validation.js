// FILE: ui/validation.js
// PURPOSE: Form validation logic for survey questions
// VERSION: 2.1.0 - Fixed numeric answer validation (star-rating, number-scale)
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
    console.warn(`[VALIDATION] Missing HTML element for ID '${elementId}'`);
  }
}

/**
 * Core "is this answer empty?" check — handles ALL value types:
 *   string, number, boolean, array, object, null, undefined
 */
function _isEmpty(answer) {
  if (answer === null || answer === undefined) return true;
  if (typeof answer === 'string')  return answer.trim() === '';
  if (typeof answer === 'number')  return false;          // 0 is a valid rating
  if (typeof answer === 'boolean') return false;
  if (Array.isArray(answer))       return answer.length === 0;
  // plain object e.g. { main: '...' }
  if (typeof answer === 'object')  return !answer.main || String(answer.main).trim() === '';
  return false;
}

/**
 * Validate a survey question based on its type and requirements.
 * @param {Object} question - Question object with validation rules
 * @param {Object} formData - Current form data to validate against
 * @returns {boolean} True if validation passes
 */
export function validateQuestion(question, formData) {
  clearErrors();

  const answer = formData[question.name];
  let isValid = true;
  let errorMessage = '';

  // ── CHECKBOX WITH OTHER ───────────────────────────────────
  if (question.type === 'checkbox-with-other') {
    if (question.required && (!Array.isArray(answer) || answer.length === 0)) {
      errorMessage = 'Please select at least one option.';
      isValid = false;
    }

    // "Other" text field required when Other is selected
    if (isValid && Array.isArray(answer) && answer.includes('Other')) {
      const otherValue = formData['otherhearabout'] || formData['other_hear_about'] || '';
      if (!otherValue || String(otherValue).trim() === '') {
        // try both possible IDs the renderer might use
        displayError('otherhearabouttextError', 'Please specify other source.');
        displayError('other_hear_about_textError', 'Please specify other source.');
        isValid = false;
      }
    }
  }

  // ── RADIO WITH OTHER ──────────────────────────────────────
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

  // ── CUSTOM CONTACT ────────────────────────────────────────
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

  // ── STAR RATING & NUMBER SCALE ────────────────────────────
  // answer is stored as a string "1"–"5" from radio input value
  else if (question.type === 'star-rating' || question.type === 'number-scale') {
    if (question.required && (answer === null || answer === undefined || answer === '')) {
      errorMessage = 'Please make a selection.';
      isValid = false;
    }
  }

  // ── ALL OTHER TYPES (emoji-radio, radio, textarea, etc.) ──
  else if (question.required && _isEmpty(answer)) {
    errorMessage = 'This response is required.';
    isValid = false;
  }

  // Display error under the question
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
 * Get all validation errors for a question (non-throwing)
 */
export function getValidationErrors(question, formData) {
  const errors  = [];
  const answer  = formData[question.name];

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

export default {
  validateQuestion,
  clearErrors,
  ...validationUtils,
};
