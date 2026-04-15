// FILE: data-util.js
// UPDATED: VERSION 3.0.0 - Added Survey Type 2 questions + dynamic question switching
// DEPENDENCIES: config.js (must load first)

window.dataUtils = (function() {

  const kioskId = window.KIOSK_CONFIG?.KIOSK_ID || 'KIOSK-GWINNETT-001';
  const AUTO_ADVANCE_DELAY = window.CONSTANTS?.AUTO_ADVANCE_DELAY_MS || 50;

  let autoAdvanceTimer = null;
  function scheduleAutoAdvance(callback, delay) {
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = setTimeout(() => { autoAdvanceTimer = null; callback(); }, delay);
  }

  // ═══════════════════════════════════════════════════════════
  // SURVEY TYPE 1 — Original Questions (UNCHANGED)
  // ═══════════════════════════════════════════════════════════
  const surveyQuestionsType1 = [
    {
      id: 'satisfaction', name: 'satisfaction', type: 'emoji-radio',
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
      id: 'cleanliness', name: 'cleanliness', type: 'number-scale',
      question: 'How would you rate the cleanliness of the facility?',
      min: 1, max: 5, labels: { min: '1 (Poor)', max: '5 (Excellent)' },
      required: true
    },
    {
      id: 'staff_friendliness', name: 'staff_friendliness', type: 'star-rating',
      question: 'How friendly was the volunteer staff?',
      min: 1, max: 5, required: true
    },
    {
      id: 'location', name: 'location', type: 'radio',
      question: 'Where are you visiting from today?',
      options: [
        { value: 'Lilburn / Gwinnett County, GA', label: 'Lilburn / Gwinnett County, GA' },
        { value: 'Metro Atlanta (not Gwinnett)', label: { line1: 'Metro Atlanta', line2: '(not Gwinnett)' } },
        { value: 'Georgia (outside Metro Atlanta)', label: { line1: 'Georgia', line2: '(outside Metro Atlanta)' } },
        { value: 'U.S. (outside Georgia)', label: { line1: 'U.S.', line2: '(outside Georgia)' } },
        { value: 'Outside the U.S. (International)', label: { line1: 'Outside the U.S.', line2: '(International)' } }
      ],
      required: true
    },
    {
      id: 'age', name: 'age', type: 'radio',
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
      id: 'hear_about', name: 'hear_about', type: 'checkbox-with-other',
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
      id: 'gift_shop_visit', name: 'gift_shop_visit', type: 'emoji-radio',
      question: 'Have you visited Shayona Cafe & the Gift Shop today?',
      options: [
        { value: 'Yes', label: 'Yes', emoji: '👍' },
        { value: 'Going Now', label: 'Going Now', emoji: '🏃‍♂️' },
        { value: 'Maybe Later', label: 'Maybe Later', emoji: '🤔' }
      ],
      required: true
    },
    {
      id: 'enjoyed_most', name: 'comments', type: 'textarea',
      question: 'Write us about your experience today. Any comment or suggestion?',
      placeholder: 'Type your comments here...',
      required: true,
      rotatingText: ['Write us about your experience today. Any comment or suggestion?']
    }
  ];

  // ═══════════════════════════════════════════════════════════
  // SURVEY TYPE 2 — New Visitor Feedback V2
  // ═══════════════════════════════════════════════════════════
  const surveyQuestionsType2 = [
    // Q1: Emotional Hook
    {
      id: 'visit_feeling', name: 'visit_feeling', type: 'emoji-radio',
      question: 'How was your visit today?',
      options: [
        { value: 'Peaceful', label: 'Peaceful', emoji: '😊' },
        { value: 'Good', label: 'Good', emoji: '🙂' },
        { value: 'Okay', label: 'Okay', emoji: '😐' },
        { value: 'Not as expected', label: 'Not as expected', emoji: '🙁' }
      ],
      required: true
    },

    // Q2: Journey Map (multi-select)
    {
      id: 'experiences', name: 'experiences', type: 'checkbox',
      question: 'What did you experience today? (Select all that apply)',
      options: [
        { value: 'Architecture & Carvings', label: '🏛️ Architecture & Carvings' },
        { value: 'Darshan / Aarti', label: '🙏 Darshan / Aarti (Shrines & Prayer)' },
        { value: 'Walking the Grounds', label: '🌿 Walking the Grounds' },
        { value: 'Shayona (Gift Shop & Cafe)', label: '🍽️ Shayona (Gift Shop & Cafe)' },
        { value: 'Interaction with Volunteers', label: '😊 Interaction with Volunteers' }
      ],
      required: true
    },

    // Q3: Sentiment Menu (single-select + optional other)
    {
      id: 'standout', name: 'standout', type: 'radio-with-other',
      question: 'What stood out most to you?',
      options: [
        { value: 'Divine & Peaceful Atmosphere', label: '✨ Divine & Peaceful Atmosphere' },
        { value: 'Magnificent Architecture', label: '🏛️ Magnificent Architecture' },
        { value: 'Kind & Helpful Volunteers', label: '😊 Kind & Helpful Volunteers' },
        { value: 'Cleanliness & Maintenance', label: '🧼 Cleanliness & Maintenance' },
        { value: 'Great Family Experience', label: '👨‍👩‍👧 Great Family Experience' }
      ],
      otherLabel: '➕ Other...',
      required: true
    },

    // Q4: Shayona Funnel (with conditional follow-up)
    {
      id: 'shayona_intent', name: 'shayona_intent', type: 'radio-with-followup',
      question: 'Regarding the Shayona (Gift Shop / Cafe):',
      options: [
        { value: 'Already visited', label: '✅ I have already visited' },
        { value: 'Plan to visit', label: '🕒 I plan to visit before I leave' },
        { value: 'Future visit', label: '📅 Maybe on a future visit', triggersFollowup: true },
        { value: 'Not today', label: '❌ Not planning to visit today', triggersFollowup: true }
      ],
      followupQuestion: 'What is the reason?',
      followupOptions: [
        { value: 'Too crowded', label: 'Too crowded' },
        { value: 'Hard to find', label: 'Hard to find' },
        { value: 'No time', label: 'No time' },
        { value: 'Not interested', label: 'Not interested' }
      ],
      required: true
    },

    // Q5: Expectation Check (with conditional follow-up)
    {
      id: 'expectation_met', name: 'expectation_met', type: 'radio-with-followup',
      question: 'Did your visit go as you had planned?',
      options: [
        { value: 'Yes, perfectly', label: '✅ Yes, perfectly' },
        { value: 'A bit different', label: '⚠️ It was a bit different than expected', triggersFollowup: true }
      ],
      followupQuestion: 'What was different? (Select all that apply)',
      followupOptions: [
        { value: 'Darshan was during a break', label: 'Darshan was during a break' },
        { value: 'Parking was difficult', label: 'Parking was difficult' },
        { value: 'Not enough signs', label: 'Not enough signs' },
        { value: 'Too many people', label: 'Too many people' }
      ],
      followupMultiple: true,
      required: true
    },

    // Q6: Wish Menu (single-select + optional custom)
    {
      id: 'future_wish', name: 'future_wish', type: 'radio-with-other',
      question: 'If you had one wish for the Mandir\'s future, what would it be?',
      options: [
        { value: 'More seating / rest areas', label: '🪑 More seating / rest areas' },
        { value: 'Easier parking or directions', label: '🚗 Easier parking or directions' },
        { value: 'More info for first-time visitors', label: '📢 More info for first-time visitors' },
        { value: 'More variety in Shayona/Cafe', label: '🍪 More variety in Shayona / Cafe' },
        { value: 'More quiet/meditation spaces', label: '✨ More quiet / meditation spaces' }
      ],
      otherLabel: '✍️ Write a custom wish',
      required: true
    },

    // Q7: Final Thoughts (optional textarea)
    {
      id: 'final_thoughts', name: 'final_thoughts', type: 'textarea',
      question: 'Anything else you\'d like to share?',
      placeholder: 'Your thoughts are welcome...',
      required: false
    }
  ];

  // ═══════════════════════════════════════════════════════════
  // ACTIVE QUESTIONS — resolved at runtime based on survey type
  // ═══════════════════════════════════════════════════════════

  /**
   * Get the currently active question set
   */
  function getActiveSurveyQuestions() {
    const type = window.KIOSK_CONFIG?.getActiveSurveyType?.() ||
                 window.CONSTANTS?.ACTIVE_SURVEY_TYPE ||
                 'type1';
    return type === 'type2' ? surveyQuestionsType2 : surveyQuestionsType1;
  }

  // ═══════════════════════════════════════════════════════════
  // QUESTION RENDERERS
  // ═══════════════════════════════════════════════════════════
  const questionRenderers = {

    'textarea': {
      render: (q, data) => `
        <div class="question-block">
          <p class="question-text">${q.question}</p>
          <textarea
            id="${q.id}"
            name="${q.name}"
            placeholder="${q.placeholder || ''}"
            class="survey-textarea"
          >${data[q.name] || ''}</textarea>
          ${!q.required ? '<p class="optional-label">Optional</p>' : ''}
        </div>`,
      setupEvents: (q, { updateData }) => {
        const element = document.getElementById(q.id);
        if (!element) { console.warn(`[textarea] Element '${q.id}' not found`); return; }
        element.addEventListener('input', (e) => { updateData(q.name, e.target.value); });
      }
    },

    'emoji-radio': {
      render: (q, data) => `
        <div class="question-block">
          <p class="question-text">${q.question}</p>
          <div class="emoji-radio-group">
            ${q.options.map(opt => `
              <button type="button"
                class="emoji-radio-btn ${data[q.name] === opt.value ? 'selected' : ''}"
                data-value="${opt.value}"
                data-question="${q.id}">
                <span class="emoji">${opt.emoji}</span>
                <span class="label">${opt.label}</span>
              </button>`).join('')}
          </div>
        </div>`,
      setupEvents: (q, { updateData, handleNextQuestion }) => {
        document.querySelectorAll(`[data-question="${q.id}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll(`[data-question="${q.id}"]`).forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            updateData(q.name, btn.dataset.value);
            scheduleAutoAdvance(handleNextQuestion, AUTO_ADVANCE_DELAY);
          });
        });
      }
    },

    'number-scale': {
      render: (q, data) => `
        <div class="question-block">
          <p class="question-text">${q.question}</p>
          <div class="number-scale-group">
            ${Array.from({ length: q.max - q.min + 1 }, (_, i) => q.min + i).map(n => `
              <button type="button"
                class="number-scale-btn ${data[q.name] == n ? 'selected' : ''}"
                data-value="${n}"
                data-question="${q.id}">${n}</button>`).join('')}
          </div>
          <div class="scale-labels">
            <span>${q.labels?.min || q.min}</span>
            <span>${q.labels?.max || q.max}</span>
          </div>
        </div>`,
      setupEvents: (q, { updateData, handleNextQuestion }) => {
        document.querySelectorAll(`[data-question="${q.id}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll(`[data-question="${q.id}"]`).forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            updateData(q.name, btn.dataset.value);
            scheduleAutoAdvance(handleNextQuestion, AUTO_ADVANCE_DELAY);
          });
        });
      }
    },

    'star-rating': {
      render: (q, data) => `
        <div class="question-block">
          <p class="question-text">${q.question}</p>
          <div class="star-rating-group" data-question="${q.id}">
            ${Array.from({ length: q.max }, (_, i) => i + 1).map(n => `
              <button type="button"
                class="star-btn ${data[q.name] >= n ? 'selected' : ''}"
                data-value="${n}"
                data-question="${q.id}">★</button>`).join('')}
          </div>
        </div>`,
      setupEvents: (q, { updateData, handleNextQuestion }) => {
        document.querySelectorAll(`[data-question="${q.id}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            const val = parseInt(btn.dataset.value);
            document.querySelectorAll(`[data-question="${q.id}"]`).forEach((b, i) => {
              b.classList.toggle('selected', i < val);
            });
            updateData(q.name, val);
            scheduleAutoAdvance(handleNextQuestion, AUTO_ADVANCE_DELAY);
          });
        });
      }
    },

    'radio': {
      render: (q, data) => `
        <div class="question-block">
          <p class="question-text">${q.question}</p>
          <div class="radio-group">
            ${q.options.map(opt => {
              const labelHtml = typeof opt.label === 'object'
                ? `<span>${opt.label.line1}</span><span class="sub">${opt.label.line2}</span>`
                : `<span>${opt.label}</span>`;
              return `
                <button type="button"
                  class="radio-btn ${data[q.name] === opt.value ? 'selected' : ''}"
                  data-value="${opt.value}"
                  data-question="${q.id}">
                  ${labelHtml}
                </button>`;
            }).join('')}
          </div>
        </div>`,
      setupEvents: (q, { updateData, handleNextQuestion }) => {
        document.querySelectorAll(`[data-question="${q.id}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll(`[data-question="${q.id}"]`).forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            updateData(q.name, btn.dataset.value);
            scheduleAutoAdvance(handleNextQuestion, AUTO_ADVANCE_DELAY);
          });
        });
      }
    },

    'checkbox': {
      render: (q, data) => {
        const selected = Array.isArray(data[q.name]) ? data[q.name] : [];
        return `
          <div class="question-block">
            <p class="question-text">${q.question}</p>
            <div class="checkbox-group">
              ${q.options.map(opt => `
                <button type="button"
                  class="checkbox-btn ${selected.includes(opt.value) ? 'selected' : ''}"
                  data-value="${opt.value}"
                  data-question="${q.id}">
                  ${opt.label}
                </button>`).join('')}
            </div>
          </div>`;
      },
      setupEvents: (q, { updateData }) => {
        document.querySelectorAll(`[data-question="${q.id}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            btn.classList.toggle('selected');
            const selected = Array.from(document.querySelectorAll(`[data-question="${q.id}"].selected`))
              .map(b => b.dataset.value);
            updateData(q.name, selected);
          });
        });
      }
    },

    'checkbox-with-other': {
      render: (q, data) => {
        const savedData = data[q.name] || {};
        const selected = Array.isArray(savedData) ? savedData : (savedData.selected || []);
        const otherText = savedData.other || '';
        return `
          <div class="question-block">
            <p class="question-text">${q.question}</p>
            <div class="checkbox-group">
              ${q.options.map(opt => `
                <button type="button"
                  class="checkbox-btn ${selected.includes(opt.value) ? 'selected' : ''}"
                  data-value="${opt.value}"
                  data-question="${q.id}">
                  ${opt.label}
                </button>`).join('')}
            </div>
            <div id="${q.id}_other_container" style="${selected.includes('Other') ? '' : 'display:none'}">
              <input type="text" id="${q.id}_other" placeholder="Please specify..."
                value="${otherText}" class="other-input" />
            </div>
          </div>`;
      },
      setupEvents: (q, { updateData }) => {
        const getVal = () => {
          const selected = Array.from(document.querySelectorAll(`[data-question="${q.id}"].selected`))
            .map(b => b.dataset.value);
          const otherInput = document.getElementById(`${q.id}_other`);
          return { selected, other: otherInput?.value || '' };
        };
        document.querySelectorAll(`[data-question="${q.id}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            btn.classList.toggle('selected');
            const container = document.getElementById(`${q.id}_other_container`);
            const hasOther = !!document.querySelector(`[data-question="${q.id}"][data-value="Other"].selected`);
            if (container) container.style.display = hasOther ? '' : 'none';
            updateData(q.name, getVal());
          });
        });
        const otherInput = document.getElementById(`${q.id}_other`);
        if (otherInput) {
          otherInput.addEventListener('input', () => updateData(q.name, getVal()));
        }
      }
    },

    // ─── NEW TYPE: radio-with-other (single select + optional keyboard) ───
    'radio-with-other': {
      render: (q, data) => {
        const savedData = data[q.name] || {};
        const selectedVal = typeof savedData === 'string' ? savedData : (savedData.main || '');
        const otherText = savedData.other || '';
        const showOther = selectedVal === 'Other' || (!q.options.find(o => o.value === selectedVal) && selectedVal);
        return `
          <div class="question-block">
            <p class="question-text">${q.question}</p>
            <div class="radio-group">
              ${q.options.map(opt => `
                <button type="button"
                  class="radio-btn ${selectedVal === opt.value ? 'selected' : ''}"
                  data-value="${opt.value}"
                  data-question="${q.id}">
                  ${opt.label}
                </button>`).join('')}
              <button type="button"
                class="radio-btn other-trigger ${showOther ? 'selected' : ''}"
                data-value="Other"
                data-question="${q.id}">
                ${q.otherLabel || '✍️ Other...'}
              </button>
            </div>
            <div id="${q.id}_other_container" style="${showOther ? '' : 'display:none'}">
              <input type="text" id="${q.id}_other"
                placeholder="Type your answer..."
                value="${otherText}"
                class="other-input" />
            </div>
          </div>`;
      },
      setupEvents: (q, { updateData, handleNextQuestion }) => {
        const getVal = () => {
          const selectedBtn = document.querySelector(`[data-question="${q.id}"].selected`);
          const val = selectedBtn?.dataset.value;
          if (val === 'Other') {
            const otherInput = document.getElementById(`${q.id}_other`);
            return { main: 'Other', other: otherInput?.value || '' };
          }
          return { main: val || '', other: '' };
        };
        document.querySelectorAll(`[data-question="${q.id}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll(`[data-question="${q.id}"]`).forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            const container = document.getElementById(`${q.id}_other_container`);
            const isOther = btn.dataset.value === 'Other';
            if (container) container.style.display = isOther ? '' : 'none';
            updateData(q.name, getVal());
            if (!isOther) scheduleAutoAdvance(handleNextQuestion, AUTO_ADVANCE_DELAY);
          });
        });
        const otherInput = document.getElementById(`${q.id}_other`);
        if (otherInput) {
          otherInput.addEventListener('input', () => updateData(q.name, getVal()));
        }
      }
    },

    // ─── NEW TYPE: radio-with-followup (conditional sub-question) ───
    'radio-with-followup': {
      render: (q, data) => {
        const savedData = data[q.name] || {};
        const selectedVal = typeof savedData === 'string' ? savedData : (savedData.main || '');
        const followupVals = savedData.followup || (savedData.followupSingle ? [savedData.followupSingle] : []);
        const triggerValues = q.options.filter(o => o.triggersFollowup).map(o => o.value);
        const showFollowup = triggerValues.includes(selectedVal);

        const followupInputsHtml = q.followupMultiple
          ? q.followupOptions.map(opt => `
              <button type="button"
                class="checkbox-btn ${followupVals.includes(opt.value) ? 'selected' : ''}"
                data-value="${opt.value}"
                data-followup="${q.id}">
                ${opt.label}
              </button>`).join('')
          : q.followupOptions.map(opt => `
              <button type="button"
                class="radio-btn ${followupVals[0] === opt.value ? 'selected' : ''}"
                data-value="${opt.value}"
                data-followup="${q.id}">
                ${opt.label}
              </button>`).join('');

        return `
          <div class="question-block">
            <p class="question-text">${q.question}</p>
            <div class="radio-group">
              ${q.options.map(opt => `
                <button type="button"
                  class="radio-btn ${selectedVal === opt.value ? 'selected' : ''}"
                  data-value="${opt.value}"
                  data-triggers-followup="${opt.triggersFollowup ? 'true' : 'false'}"
                  data-question="${q.id}">
                  ${opt.label}
                </button>`).join('')}
            </div>
            <div id="${q.id}_followup" style="${showFollowup ? '' : 'display:none'}">
              <p class="followup-label">${q.followupQuestion}</p>
              <div class="${q.followupMultiple ? 'checkbox-group' : 'radio-group'}">
                ${followupInputsHtml}
              </div>
            </div>
          </div>`;
      },
      setupEvents: (q, { updateData, handleNextQuestion }) => {
        const getVal = () => {
          const selectedBtn = document.querySelector(`[data-question="${q.id}"].selected`);
          const main = selectedBtn?.dataset.value || '';
          const followupBtns = Array.from(document.querySelectorAll(`[data-followup="${q.id}"].selected`));
          const followup = followupBtns.map(b => b.dataset.value);
          return { main, followup };
        };

        document.querySelectorAll(`[data-question="${q.id}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll(`[data-question="${q.id}"]`).forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            const followupDiv = document.getElementById(`${q.id}_followup`);
            const triggers = btn.dataset.triggersFollowup === 'true';
            if (followupDiv) followupDiv.style.display = triggers ? '' : 'none';
            // Reset followup selection when toggling
            if (!triggers) {
              document.querySelectorAll(`[data-followup="${q.id}"]`).forEach(b => b.classList.remove('selected'));
            }
            updateData(q.name, getVal());
            if (!triggers) scheduleAutoAdvance(handleNextQuestion, AUTO_ADVANCE_DELAY);
          });
        });

        document.querySelectorAll(`[data-followup="${q.id}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            if (q.followupMultiple) {
              btn.classList.toggle('selected');
            } else {
              document.querySelectorAll(`[data-followup="${q.id}"]`).forEach(b => b.classList.remove('selected'));
              btn.classList.add('selected');
            }
            updateData(q.name, getVal());
          });
        });
      }
    }

  };

  // ═══════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════
  return {
    // Expose both question sets for reference
    surveyQuestionsType1,
    surveyQuestionsType2,

    // Active questions — always use this in core.js / submit.js
    get surveyQuestions() {
      return getActiveSurveyQuestions();
    },

    questionRenderers,
    scheduleAutoAdvance,
    kioskId
  };

})();

console.log('[DATA-UTIL] ✅ dataUtils initialized');
console.log(`[DATA-UTIL] Active survey type: ${window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1'}`);
console.log(`[DATA-UTIL] Active questions: ${window.dataUtils.surveyQuestions.length}`);
