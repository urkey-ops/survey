// FILE: data-util.js
// OPTIMIZED: iPad landscape kiosk - removes Tailwind conflicts, fixes layout issues

window.dataUtils = (function() {

    const kioskId = window.KIOSK_CONFIG?.KIOSK_ID || 'KIOSK-GWINNETT-001';
    const AUTO_ADVANCE_DELAY = window.CONSTANTS?.AUTO_ADVANCE_DELAY_MS || 50;
    
    const surveyQuestions = [
        {
            id: 'satisfaction',
            name: 'satisfaction',
            type: 'emoji-radio',
            question: 'Overall, how satisfied were you with your visit today?',
            options: [
                { value: 'Sad', label: 'Sad', emoji: '😞' },
                { value: 'Neutral', label: 'Neutral', emoji: '😐' },
                { value: 'Happy', label: 'Happy', emoji: '🙂' },
                { value: 'Super Happy', label: 'Super Happy', emoji: '😄' }
            ],
            required: true
        },
        {
            id: 'cleanliness',
            name: 'cleanliness',
            type: 'number-scale',
            question: 'How would you rate the cleanliness of the facility?',
            min: 1,
            max: 5,
            labels: { min: '1 (Poor)', max: '5 (Excellent)' },
            required: true
        },
        {
            id: 'staff_friendliness',
            name: 'staff_friendliness',
            type: 'star-rating',
            question: 'How friendly was the volunteer staff?',
            min: 1,
            max: 5,
            required: true
        },
        {
            id: 'location',
            name: 'location',
            type: 'radio',
            question: 'Where are you visiting from today?',
            options: [
                {
                    value: 'Lilburn / Gwinnett County, GA',
                    label: 'Lilburn / Gwinnett County, GA'
                },
                {
                    value: 'Metro Atlanta (not Gwinnett)',
                    label: {
                        line1: 'Metro Atlanta',
                        line2: '(not Gwinnett)'
                    }
                },
                {
                    value: 'Georgia (outside Metro Atlanta)',
                    label: {
                        line1: 'Georgia',
                        line2: '(outside Metro Atlanta)'
                    }
                },
                {
                    value: 'U.S. (outside Georgia)',
                    label: {
                        line1: 'U.S.',
                        line2: '(outside Georgia)'
                    }
                },
                {
                    value: 'Outside the U.S. (International)',
                    label: {
                        line1: 'Outside the U.S.',
                        line2: '(International)'
                    }
                }
            ],
            required: true
        },
        {
            id: 'age',
            name: 'age',
            type: 'radio',
            question: 'Which age group do you belong to?',
            options: [
                { value: 'Under 18', label: 'Under 18' },
                { value: '18-29', label: '18–29' },
                { value: '30-49', label: '30–49' },
                { value: '50-64', label: '50–64' },
                { value: '65+', label: '65+' }
            ],
            required: true
        },
        {
            id: 'hear_about',
            name: 'hear_about',
            type: 'checkbox-with-other',
            question: 'How did you first hear about us?',
            options: [
                { value: 'Instagram', label: 'Instagram' },
                { value: 'Facebook', label: 'Facebook' },
                { value: 'TikTok', label: 'TikTok' },
                { value: 'Search', label: 'Search (Google, Bing, etc.)' },
                { value: 'Friend', label: 'Friend / Word of Mouth' },
                { value: 'Drove by', label: 'Drove by / Saw your location' },
                { value: 'Other', label: 'Other' }
            ],
            required: true
        },
        {
            id: 'gift_shop_visit',
            name: 'gift_shop_visit',
            type: 'emoji-radio',
            question: 'Have you visited Shayona Cafe & the Gift Shop today?',
            options: [
                { value: 'Yes', label: 'Yes', emoji: '👍' },
                { value: 'Going Now', label: 'Going Now', emoji: '🏃‍♂️' },
                { value: 'Maybe Later', label: 'Maybe Later', emoji: '🤔' }
            ],
            required: true
        },
        {
            id: 'enjoyed_most',
            name: 'comments',
            type: 'textarea',
            question: 'Write us about your experience today. Any comment or suggestion?',
            placeholder: 'Type your comments here...',
            required: true,
            rotatingText: [
                "Write us about your experience today. Any comment or suggestion?",
            ]
        }
    ];

    const questionRenderers = {

        'textarea': {
            render: (q, data) => `
                <label id="rotatingQuestion" for="${q.id}" class="block text-gray-700 font-semibold mb-2" aria-live="polite">${q.question}</label>
                <textarea 
                    id="${q.id}" 
                    name="${q.name}" 
                    rows="4" 
                    class="shadow-sm resize-none appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="${q.placeholder}" 
                    ${q.required ? 'required aria-required="true"' : ''}>${data[q.name] || ''}</textarea>
                <span id="${q.id}Error" class="error-message text-red-500 text-sm hidden"></span>`,
            setupEvents: (q, { updateData }) => {
                const element = document.getElementById(q.id);
                if (!element) {
                    console.warn(`[textarea] Element with id '${q.id}' not found`);
                    return;
                }
                
                element.addEventListener('input', (e) => {
                    updateData(q.name, e.target.value);
                });
            }
        },

        'emoji-radio': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="emoji-radio-group" role="radiogroup" aria-labelledby="${q.id}Label" ${q.required ? 'aria-required="true"' : ''}>
                    ${q.options.map(opt => `
                        <input 
                            type="radio" 
                            id="${q.id + opt.value}" 
                            name="${q.name}" 
                            value="${opt.value}" 
                            class="visually-hidden" 
                            ${data[q.name] === opt.value ? 'checked' : ''} 
                            aria-checked="${data[q.name] === opt.value}">
                        <label for="${q.id + opt.value}" role="radio" aria-label="${opt.label}">
                            <span aria-hidden="true">${opt.emoji}</span>
                            <span>${opt.label}</span>
                        </label>
                    `).join('')}
                </div>
                <span id="${q.id}Error" class="error-message hidden"></span>`,
            setupEvents: (q, { handleNextQuestion, updateData }) => {
                const container = document.querySelector('.emoji-radio-group');
                if (!container) {
                    console.warn(`[emoji-radio] Container not found for question '${q.name}'`);
                    return;
                }
                
                container.addEventListener('change', (e) => {
                    if (e.target.name === q.name) {
                        updateData(q.name, e.target.value);
                        setTimeout(() => handleNextQuestion(), AUTO_ADVANCE_DELAY);
                    }
                });
            }
        },

        'number-scale': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="number-scale-group" role="radiogroup" aria-labelledby="${q.id}Label" data-question-name="${q.name}" ${q.required ? 'aria-required="true"' : ''}>
                    ${Array.from({ length: q.max }, (_, i) => i + 1).map(num => `
                        <input 
                            type="radio" 
                            id="${q.id + num}" 
                            name="${q.name}" 
                            value="${num}" 
                            class="visually-hidden" 
                            ${String(data[q.name]) === String(num) ? 'checked' : ''} 
                            aria-checked="${String(data[q.name]) === String(num)}">
                        <label for="${q.id + num}" role="radio" aria-label="Rating ${num}">
                            <span>${num}</span>
                        </label>
                    `).join('')}
                </div>
                <div class="flex justify-between text-sm mt-2 text-gray-500">
                    <span>${q.labels.min}</span>
                    <span>${q.labels.max}</span>
                </div>
                <span id="${q.id}Error" class="error-message hidden"></span>`,
            setupEvents: (q, { handleNextQuestion, updateData }) => {
                const container = document.querySelector('.number-scale-group');
                if (!container) {
                    console.warn(`[number-scale] Container not found for question '${q.name}'`);
                    return;
                }
                
                container.addEventListener('change', (e) => {
                    if (e.target.name === q.name) {
                        updateData(q.name, e.target.value);
                        setTimeout(() => handleNextQuestion(), AUTO_ADVANCE_DELAY);
                    }
                });
            }
        },

        'star-rating': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="star-rating" role="radiogroup" aria-labelledby="${q.id}Label" data-question-name="${q.name}" ${q.required ? 'aria-required="true"' : ''}>
                    ${Array.from({ length: q.max }, (_, i) => q.max - i).map(num => `
                        <input 
                            type="radio" 
                            id="${q.id + num}" 
                            name="${q.name}" 
                            value="${num}" 
                            class="visually-hidden" 
                            ${String(data[q.name]) === String(num) ? 'checked' : ''} 
                            aria-checked="${String(data[q.name]) === String(num)}">
                        <label for="${q.id + num}" class="star" role="radio" aria-label="${num} stars">★</label>
                    `).join('')}
                </div>
                <span id="${q.id}Error" class="error-message hidden"></span>`,
            setupEvents: (q, { handleNextQuestion, updateData }) => {
                const container = document.querySelector('.star-rating');
                if (!container) {
                    console.warn(`[star-rating] Container not found for question '${q.name}'`);
                    return;
                }
                
                container.addEventListener('change', (e) => {
                    if (e.target.name === q.name) {
                        updateData(q.name, e.target.value);
                        setTimeout(() => handleNextQuestion(), AUTO_ADVANCE_DELAY);
                    }
                });
            }
        },

        'radio-with-other': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="location-radio-group" role="radiogroup" aria-labelledby="${q.id}Label" data-question-name="${q.name}" ${q.required ? 'aria-required="true"' : ''}>
                    ${q.options.map(opt => `
                        <input 
                            type="radio" 
                            id="${q.id + opt.value}" 
                            name="${q.name}" 
                            value="${opt.value}" 
                            class="visually-hidden" 
                            ${data[q.name] === opt.value ? 'checked' : ''} 
                            aria-checked="${data[q.name] === opt.value}">
                        <label for="${q.id + opt.value}" role="radio">${opt.label}</label>
                    `).join('')}
                </div>
                <div id="other-location-container" class="hidden-fields ${data[q.name] === 'Other' ? 'visible-fields' : ''}">
                    <input 
                        type="text" 
                        id="other_location_text" 
                        name="other_location" 
                        class="shadow-sm border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700" 
                        placeholder="Please specify" 
                        value="${data['other_location'] || ''}"
                        aria-label="Specify other location">
                    <span id="other_location_textError" class="error-message hidden"></span>
                </div>
                <span id="${q.id}Error" class="error-message hidden"></span>`,
            setupEvents: (q, { handleNextQuestion, updateData }) => {
                const container = document.querySelector('.location-radio-group');
                const otherContainer = document.getElementById('other-location-container');
                const otherInput = document.getElementById('other_location_text');
                
                if (!container) {
                    console.warn(`[radio-with-other] Container not found for question '${q.name}'`);
                    return;
                }

                container.addEventListener('change', (e) => {
                    if (e.target.name === q.name) {
                        updateData(q.name, e.target.value);
                        
                        if (!otherContainer) return;
                        
                        if (e.target.value === 'Other') {
                            otherContainer.classList.remove('hidden-fields');
                            otherContainer.classList.add('visible-fields');
                            if (otherInput) otherInput.focus();
                        } else {
                            otherContainer.classList.remove('visible-fields');
                            otherContainer.classList.add('hidden-fields');
                            updateData('other_location', '');
                            setTimeout(() => handleNextQuestion(), AUTO_ADVANCE_DELAY);
                        }
                    }
                });

                if (otherInput) {
                    otherInput.addEventListener('input', (e) => {
                        updateData('other_location', e.target.value);
                    });
                }
            }
        },

        'radio': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="age-radio-group" role="radiogroup" aria-labelledby="${q.id}Label" data-question-name="${q.name}" ${q.required ? 'aria-required="true"' : ''}>
                    ${q.options.map(opt => `
                        <input 
                            type="radio" 
                            id="${q.id + opt.value}" 
                            name="${q.name}" 
                            value="${opt.value}" 
                            class="visually-hidden" 
                            ${data[q.name] === opt.value ? 'checked' : ''} 
                            aria-checked="${data[q.name] === opt.value}">
                        <label for="${q.id + opt.value}" role="radio">
                            ${typeof opt.label === 'object' ? `
                                <span>${opt.label.line1}</span><br>
                                <span>${opt.label.line2}</span>
                            ` : opt.label}
                        </label>
                    `).join('')}
                </div>
                <span id="${q.id}Error" class="error-message hidden"></span>`,
            setupEvents: (q, { handleNextQuestion, updateData }) => {
                const container = document.querySelector('.age-radio-group');
                if (!container) {
                    console.warn(`[radio] Container not found for question '${q.name}'`);
                    return;
                }
                
                container.addEventListener('change', (e) => {
                    if (e.target.name === q.name) {
                        updateData(q.name, e.target.value);
                        setTimeout(() => handleNextQuestion(), AUTO_ADVANCE_DELAY);
                    }
                });
            }
        },

        'checkbox-with-other': {
            render: (q, data) => {
                const selectedValues = Array.isArray(data[q.name]) ? data[q.name] : [];
                return `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <p class="text-sm text-gray-600 mb-3 italic">You can select more than one option</p>
                <div class="checkbox-group" role="group" aria-labelledby="${q.id}Label" data-question-name="${q.name}" ${q.required ? 'aria-required="true"' : ''}>
                    ${q.options.map(opt => `
                        <div class="checkbox-tab-wrapper">
                            <input 
                                type="checkbox" 
                                id="${q.id + opt.value}" 
                                name="${q.name}" 
                                value="${opt.value}" 
                                class="visually-hidden" 
                                ${selectedValues.includes(opt.value) ? 'checked' : ''}>
                            <label for="${q.id + opt.value}" class="${selectedValues.includes(opt.value) ? 'checked' : ''}">
                                <span class="checkbox-indicator">
                                    ${selectedValues.includes(opt.value) ? '<svg class="checkmark" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>' : ''}
                                </span>
                                <span>${opt.label}</span>
                            </label>
                        </div>
                    `).join('')}
                </div>
                <div id="other-hear-about-container" class="hidden-fields ${selectedValues.includes('Other') ? 'visible-fields' : ''}">
                    <input 
                        type="text" 
                        id="other_hear_about_text" 
                        name="other_hear_about" 
                        class="shadow-sm border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700" 
                        placeholder="Please specify" 
                        value="${data['other_hear_about'] || ''}"
                        aria-label="Specify other source">
                    <span id="other_hear_about_textError" class="error-message hidden"></span>
                </div>
                <span id="${q.id}Error" class="error-message hidden"></span>`;
            },
            setupEvents: (q, { updateData }) => {
                const container = document.querySelector('.checkbox-group');
                const otherContainer = document.getElementById('other-hear-about-container');
                const otherInput = document.getElementById('other_hear_about_text');
                
                if (!container) {
                    console.warn(`[checkbox-with-other] Container not found for question '${q.name}'`);
                    return;
                }

                container.addEventListener('change', (e) => {
                    if (e.target.name === q.name) {
                        const checkboxes = container.querySelectorAll(`input[name="${q.name}"]:checked`);
                        const values = Array.from(checkboxes).map(cb => cb.value);
                        updateData(q.name, values);
                        
                        // Update checked state via CSS class
                        container.querySelectorAll('label').forEach(label => {
                            const checkbox = document.getElementById(label.getAttribute('for'));
                            const indicator = label.querySelector('.checkbox-indicator');
                            
                            if (checkbox && checkbox.checked) {
                                label.classList.add('checked');
                                indicator.innerHTML = '<svg class="checkmark" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>';
                            } else {
                                label.classList.remove('checked');
                                indicator.innerHTML = '';
                            }
                        });
                        
                        if (!otherContainer) return;
                        
                        if (values.includes('Other')) {
                            otherContainer.classList.remove('hidden-fields');
                            otherContainer.classList.add('visible-fields');
                            if (otherInput) otherInput.focus();
                        } else {
                            otherContainer.classList.remove('visible-fields');
                            otherContainer.classList.add('hidden-fields');
                            updateData('other_hear_about', '');
                        }
                    }
                });

                if (otherInput) {
                    otherInput.addEventListener('input', (e) => {
                        updateData('other_hear_about', e.target.value);
                    });
                }
            }
        }
    };

    return { 
        surveyQuestions, 
        questionRenderers,
        kioskId
    };
})();
