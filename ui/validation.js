// FILE: ui/validation.js
// EXTRACTED FROM: kioskUI.js (Lines 230-410)
// PURPOSE: Form validation logic for survey questions
// DEPENDENCIES: None (pure validation functions)

/**
 * Email validation regex
 * Matches standard email format: user@domain.com
 */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Clear all error messages in the form
 * Hides all elements with class 'error-message'
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
 * @param {string} message - Error message to display
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
 * Validate a survey question based on its type and requirements
 * @param {Object} question - Question object with validation rules
 * @param {Object} formData - Current form data to validate against
 * @returns {boolean} - True if validation passes, false otherwise
 */
export function validateQuestion(question, formData) {
    clearErrors();
    
    const answer = formData[question.name];
    let isValid = true;
    let errorMessage = '';

    // ─────────────────────────────────────────────────────────────────
    // CHECKBOX WITH OTHER - Validate array of selections
    // ─────────────────────────────────────────────────────────────────
    if (question.type === 'checkbox-with-other') {
        // Check if at least one option is selected
        if (question.required && (!answer || !Array.isArray(answer) || answer.length === 0)) {
            errorMessage = 'Please select at least one option.';
            isValid = false;
        }
        
        // If "Other" is selected, validate the text field
        if (Array.isArray(answer) && answer.includes('Other')) {
            const otherValue = formData['other_hear_about'];
            if (!otherValue || otherValue.trim() === '') {
                displayError('other_hear_about_textError', 'Please specify other source.');
                isValid = false;
            }
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // RADIO WITH OTHER - Validate selection and "other" text
    // ─────────────────────────────────────────────────────────────────
    else if (question.type === 'radio-with-other') {
        // Check if required field is filled
        if (question.required && (!answer || answer.trim() === '')) {
            errorMessage = 'This response is required.';
            isValid = false;
        }
        
        // If "Other" is selected, validate the text field
        if (answer === 'Other') {
            const otherValue = formData['other_location'];
            if (!otherValue || otherValue.trim() === '') {
                displayError('other_location_textError', 'Please specify your location.');
                isValid = false;
            }
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // CUSTOM CONTACT - Validate name and email when consent given
    // ─────────────────────────────────────────────────────────────────
    else if (question.type === 'custom-contact') {
        const consent = formData['newsletterConsent'] === 'Yes';
        const name = formData['name'];
        const email = formData['email'];

        if (consent) {
            // Name is required if consent given
            if (!name || name.trim() === '') {
                displayError('nameError', 'Name is required for contact.');
                isValid = false;
            }
            
            // Email must be valid format if consent given
            if (!email || !emailRegex.test(email)) {
                displayError('emailError', 'Please enter a valid email address.');
                isValid = false;
            }
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // STANDARD REQUIRED FIELD - All other question types
    // ─────────────────────────────────────────────────────────────────
    else if (question.required && (!answer || (typeof answer === 'string' && answer.trim() === ''))) {
        errorMessage = 'This response is required.';
        isValid = false;
    }

    // Display main error message if validation failed
    if (!isValid && errorMessage) {
        displayError(question.id + 'Error', errorMessage);
    }

    return isValid;
}

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} - True if valid email format
 */
export function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }
    return emailRegex.test(email.trim());
}

/**
 * Validate required field (any type)
 * @param {*} value - Value to validate
 * @returns {boolean} - True if field has a value
 */
export function validateRequired(value) {
    if (value === null || value === undefined) {
        return false;
    }
    
    if (typeof value === 'string') {
        return value.trim() !== '';
    }
    
    if (Array.isArray(value)) {
        return value.length > 0;
    }
    
    return true;
}

/**
 * Validate array has at least one selection
 * @param {Array} arr - Array to validate
 * @returns {boolean} - True if array has elements
 */
export function validateArrayNotEmpty(arr) {
    return Array.isArray(arr) && arr.length > 0;
}

/**
 * Get all validation errors for a question (non-throwing)
 * @param {Object} question - Question to validate
 * @param {Object} formData - Form data to validate
 * @returns {Array<string>} - Array of error messages (empty if valid)
 */
export function getValidationErrors(question, formData) {
    const errors = [];
    const answer = formData[question.name];

    // Check required
    if (question.required && !validateRequired(answer)) {
        errors.push('This response is required.');
    }

    // Check email format
    if (question.type === 'email' && answer && !validateEmail(answer)) {
        errors.push('Please enter a valid email address.');
    }

    // Check array not empty
    if (question.type === 'checkbox-with-other' && question.required) {
        if (!validateArrayNotEmpty(answer)) {
            errors.push('Please select at least one option.');
        }
    }

    // Check "Other" text fields
    if (question.type === 'checkbox-with-other' && Array.isArray(answer) && answer.includes('Other')) {
        if (!validateRequired(formData['other_hear_about'])) {
            errors.push('Please specify other source.');
        }
    }

    if (question.type === 'radio-with-other' && answer === 'Other') {
        if (!validateRequired(formData['other_location'])) {
            errors.push('Please specify your location.');
        }
    }

    return errors;
}

/**
 * Batch validate multiple questions
 * @param {Array<Object>} questions - Array of questions to validate
 * @param {Object} formData - Form data to validate
 * @returns {Object} - { isValid: boolean, errors: Object }
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

// Export validation utilities
export const validationUtils = {
    emailRegex,
    validateEmail,
    validateRequired,
    validateArrayNotEmpty,
    getValidationErrors,
    validateMultipleQuestions
};

// Default export
export default {
    validateQuestion,
    clearErrors,
    ...validationUtils
};
