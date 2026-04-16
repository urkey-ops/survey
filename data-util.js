// FILE: data-util.js
// PURPOSE: Survey questions definition and question renderers
// VERSION: 5.1.0 - Grid centering + orphan fix + press feedback + readability bumps
//   CHANGES FROM 3.3.0:
//   - getGridCols() / getGridMaxWidth() helpers added
//   - All option grids: grid-template-columns set dynamically via getGridCols()
//   - All option grids: justify-content:center (CSS backs this up too)
//   - All option <label> elements: option-label class added (press feedback)
//   - Multi-line labels: <span class="block"> so line1/line2 stack centered
//   - checkbox-group labels: items-start so indicator tops out on text wrap
//   - followup option labels: followup-option-label class (0.9rem font)
//   - followup panel heading: followup-panel-label class (0.95rem font)

window.dataUtils = (function () {

  // ─── Config ───────────────────────────────────────────────────────────────
  const kioskId = window.KIOSK_CONFIG?.KIOSK_ID || 'KIOSK-GWINNETT-001';
  const AUTOADVANCE_DELAY = window.CONSTANTS?.AUTO_ADVANCE_DELAY_MS || 50;

  let autoAdvanceTimer = null;
  function scheduleAutoAdvance(callback, delay) {
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = setTimeout(() => { autoAdvanceTimer = null; callback(); }, delay);
  }

  // ─── GRID HELPERS ─────────────────────────────────────────────────────────

  /**
   * Returns ideal column count for n options.
   * Avoids orphan-heavy layouts (e.g. 4 items → 2×2, not 3+1).
   */
  function getGridCols(n) {
    if (n <= 1) return 1;
    if (n === 2) return 2;
    if (n === 3) return 3;
    if (n === 4) return 2;
    if (n === 5) return 5;
    if (n === 6) return 3;
    if (n === 7) return 4;
    if (n === 8) return 4;
    if (n === 9) return 3;
    if (n === 10) return 5;
    return 3;
  }

  /**
   * Constrains small grids so they don't stretch across the full card width.
   */
  function getGridMaxWidth(n, cols) {
    if (cols <= 2 && n <= 4) return 'max-width:320px; margin-left:auto; margin-right:auto;';
    if (cols === 3 && n <= 3) return 'max-width:460px; margin-left:auto; margin-right:auto;';
    return '';
  }

  // ─── STYLE HELPERS ────────────────────────────────────────────────────────

  function applyRadioSelectedStyles(container, inputName) {
    const labels = container.querySelectorAll('label');
    labels.forEach(label => {
      const forAttr = label.getAttribute('for');
      const input   = forAttr ? document.getElementById(forAttr) : null;
      if (!input) return;
      if (input.checked) {
        label.classList.add('bg-orange-500', 'text-white', 'border-orange-500');
        label.classList.remove('bg-white', 'text-gray-700', 'border-gray-300', 'border-transparent', 'hover:bg-gray-50');
      } else {
        label.classList.remove('bg-orange-500', 'text-white', 'border-orange-500');
        label.classList.add('bg-white', 'text-gray-700', 'border-gray-300', 'hover:bg-gray-50');
      }
    });
  }

  function applyStarSelectedStyles(container, selectedValue) {
    const labels = container.querySelectorAll('label.star');
    labels.forEach(label => {
      const forAttr = label.getAttribute('for');
      const input   = forAttr ? document.getElementById(forAttr) : null;
      if (!input) return;
      const starVal = parseInt(input.value, 10);
      const selVal  = parseInt(selectedValue, 10);
      if (starVal <= selVal) {
        label.classList.add('text-yellow-400');
        label.classList.remove('text-gray-300');
      } else {
        label.classList.remove('text-yellow-400');
        label.classList.add('text-gray-300');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SURVEY TYPE 1
  // ═══════════════════════════════════════════════════════════
  const surveyQuestionsType1 = [
    {
      id: 'satisfaction',
      name: 'satisfaction',
      type: 'emoji-radio',
      question: 'Overall, how satisfied were you with your visit today?',
      options: [
        { value: 'Sad',         label: 'Sad',         emoji: '😢' },
        { value: 'Neutral',     label: 'Neutral',     emoji: '😐' },
        { value: 'Happy',       label: 'Happy',       emoji: '😊' },
        { value: 'Super Happy', label: 'Super Happy', emoji: '🤩' },
      ],
      required: true,
    },
    {
      id: 'cleanliness',
      name: 'cleanliness',
      type: 'number-scale',
      question: 'How would you rate the cleanliness of the facility?',
      min: 1, max: 5,
      labels: { min: '1 – Poor', max: '5 – Excellent' },
      required: true,
    },
    {
      id: 'stafffriendliness',
      name: 'staff_friendliness',
      type: 'star-rating',
      question: 'How friendly was the volunteer staff?',
      min: 1, max: 5,
      required: true,
    },
    {
      id: 'location',
      name: 'location',
      type: 'radio-with-other',
      question: 'Where are you visiting from today?',
      options: [
        { value: 'Lilburn Gwinnett County, GA',   label: 'Lilburn Gwinnett County, GA' },
        { value: 'Metro Atlanta not Gwinnett',     label: { line1: 'Metro Atlanta',    line2: 'not Gwinnett' } },
        { value: 'Georgia outside Metro Atlanta',  label: { line1: 'Georgia',          line2: 'outside Metro Atlanta' } },
        { value: 'U.S. outside Georgia',           label: { line1: 'U.S.',             line2: 'outside Georgia' } },
        { value: 'Outside the U.S. International', label: { line1: 'Outside the U.S.', line2: 'International' } },
      ],
      required: true,
    },
    {
      id: 'age',
      name: 'age',
      type: 'radio',
      question: 'Which age group do you belong to?',
      options: [
        { value: 'Under 18', label: 'Under 18' },
        { value: '18-29',    label: '18–29' },
        { value: '30-49',    label: '30–49' },
        { value: '50-64',    label: '50–64' },
        { value: '65+',      label: '65+' },
      ],
      required: true,
    },
    {
      id: 'hearabout',
      name: 'hear_about',
      type: 'checkbox-with-other',
      question: 'How did you first hear about us?',
      options: [
        { value: 'Instagram', label: 'Instagram' },
        { value: 'Facebook',  label: 'Facebook' },
        { value: 'TikTok',    label: 'TikTok' },
        { value: 'Search',    label: 'Search (Google, Bing, etc.)' },
        { value: 'Friend',    label: 'Friend / Word of Mouth' },
        { value: 'Drove by',  label: 'Drove by / Saw your location' },
        { value: 'Other',     label: 'Other' },
      ],
      required: true,
    },
    {
      id: 'giftshopvisit',
      name: 'gift_shop_visit',
      type: 'emoji-radio',
      question: 'Have you visited Shayona Cafe & the Gift Shop today?',
      options: [
        { value: 'Yes',         label: 'Yes',         emoji: '✅' },
        { value: 'Going Now',   label: 'Going Now',   emoji: '🏃' },
        { value: 'Maybe Later', label: 'Maybe Later', emoji: '🤔' },
      ],
      required: true,
    },
    {
      id: 'enjoyedmost',
      name: 'comments',
      type: 'textarea',
      question: 'Write us about your experience today. Any comment or suggestion?',
      placeholder: 'Type your comments here...',
      required: true,
    },
  ];

  // ═══════════════════════════════════════════════════════════
  // SURVEY TYPE 2
  // ═══════════════════════════════════════════════════════════
  const surveyQuestionsType2 = [
    {
      id: 'satisfaction',
      name: 'satisfaction',
      type: 'emoji-radio',
      question: 'Overall, how satisfied were you with your visit today?',
      options: [
        { value: 'Sad',         label: 'Sad',         emoji: '😢' },
        { value: 'Neutral',     label: 'Neutral',     emoji: '😐' },
        { value: 'Happy',       label: 'Happy',       emoji: '😊' },
        { value: 'Super Happy', label: 'Super Happy', emoji: '🤩' },
      ],
      required: true,
    },
    {
      id: 'experiences',
      name: 'experiences',
      type: 'checkbox-with-other',
      question: 'What did you enjoy most today? (Select up to 3)',
      options: [
        { value: 'Art & Architecture',    label: 'Art & Architecture' },
        { value: 'Darshan & Ceremonies',  label: 'Darshan & Ceremonies' },
        { value: 'Walking the Grounds',   label: 'Walking the Grounds' },
        { value: 'Shayona Cafe & Shop',   label: 'Shayona Cafe & Shop' },
        { value: 'Volunteers & Service',  label: 'Volunteers & Service' },
        { value: 'Time with Family',      label: 'Time with Family' },
      ],
      required: true,
    },
    {
      id: 'standout',
      name: 'standout',
      type: 'radio-with-other',
      question: 'What best describes your experience today?',
      options: [
        { value: 'Peaceful atmosphere',        label: 'Peaceful Atmosphere' },
        { value: 'Friendly volunteers',        label: 'Friendly Volunteers' },
        { value: 'Welcoming environment',      label: 'Welcoming Environment' },
        { value: 'Cleanliness & upkeep',       label: 'Cleanliness & Upkeep' },
        { value: 'Family-friendly experience', label: 'Family-friendly Experience' },
        { value: 'Other',                      label: 'Something Else' },
      ],
      required: true,
    },
    {
      id: 'shayona_intent',
      name: 'shayona_intent',
      type: 'radio-with-followup',
      question: 'Have you visited the Shayona Cafe and the Gift Shop today?',
      options: [
        { value: 'Already visited',       label: 'Already visited',       followupLabel: null, followupOptions: [] },
        { value: 'Going there now',       label: 'Going there now',       followupLabel: null, followupOptions: [] },
        { value: 'Maybe next time',       label: 'Maybe next time',       followupLabel: 'What would help next time?', followupOptions: ["Better signs","More information","See what's offered","Campus map"] },
        { value: "Didn't know about it",  label: "Didn't know about it",  followupLabel: 'What would help next time?', followupOptions: ["Better signs","More information","See what's offered","Campus map"] },
      ],
      required: true,
    },
    {
      id: 'expectation_met',
      name: 'expectation_met',
      type: 'radio-with-followup',
      question: 'Did your visit flow smoothly today?',
      options: [
        { value: 'Yes everything was smooth',  label: 'Yes, everything was smooth', followupLabel: null, followupOptions: [] },
        { value: 'A few things were unclear',  label: 'A few things were unclear',  followupLabel: 'What was unclear?', followupOptions: ['Darshan timing','Finding my way','Signs & directions','Parking'] },
      ],
      required: true,
    },
    {
      id: 'final_thoughts',
      name: 'final_thoughts',
      type: 'textarea',
      question: 'Would you like to share a thought, reflection, or prayer?',
      placeholder: 'Type your thoughts here...',
      required: false,
    },
  ];

  // ─── Active question set resolver ─────────────────────────────────────────
  function getSurveyQuestions() {
    const activeType = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';
    return activeType === 'type2' ? surveyQuestionsType2 : surveyQuestionsType1;
  }

  // ─── Question Renderers ───────────────────────────────────────────────────
  const questionRenderers = {

    // ── TEXTAREA ─────────────────────────────────────────────────────────────
    textarea: {
      render(q, data) {
        return `
          <label id="rotatingQuestion" for="${q.id}"
            class="block text-gray-700 font-semibold mb-2" aria-live="polite">${q.question}</label>
          <textarea id="${q.id}" name="${q.name}" rows="4"
            class="shadow-sm resize-none appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="${q.placeholder}"
            ${q.required ? 'required' : ''}
            data-${q.name}></textarea>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm hidden"></span>`;
      },
      setupEvents(q, handleNextQuestion, updateData) {
        const el = document.getElementById(q.id);
        if (!el) return;
        el.addEventListener('input', e => updateData(q.name, e.target.value));
      },
    },

    // ── EMOJI RADIO ──────────────────────────────────────────────────────────
    'emoji-radio': {
      render(q, data) {
        const n    = q.options.length;
        const cols = getGridCols(n);
        const maxW = getGridMaxWidth(n, cols);

        const opts = q.options.map(opt => `
          <input type="radio" id="${q.id}_${opt.value.replace(/\s+/g,'_')}"
            name="${q.name}" value="${opt.value}"
            class="visually-hidden"
            ${data[q.name] === opt.value ? 'checked' : ''}>
          <label for="${q.id}_${opt.value.replace(/\s+/g,'_')}"
            class="option-label flex flex-col items-center p-4 sm:p-6 border-2 rounded-full cursor-pointer transition-all duration-200 bg-white border-transparent hover:bg-gray-50 text-gray-700">
            <span class="text-4xl sm:text-5xl mb-2" aria-hidden="true">${opt.emoji}</span>
            <span class="text-sm font-medium">${opt.label}</span>
          </label>`).join('');

        return `
          <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
          <div class="emoji-radio-group"
            style="display:grid; grid-template-columns:repeat(${cols},1fr); gap:8px; ${maxW}"
            role="radiogroup" aria-labelledby="${q.id}Label">${opts}</div>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm hidden mt-2 block"></span>`;
      },
      setupEvents(q, handleNextQuestion, updateData) {
        const container = document.querySelector('.emoji-radio-group');
        if (!container) return;
        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;
          updateData(q.name, e.target.value);
          scheduleAutoAdvance(handleNextQuestion, AUTOADVANCE_DELAY);
        });
      },
    },

    // ── NUMBER SCALE ─────────────────────────────────────────────────────────
    'number-scale': {
      render(q, data) {
        const btns = Array.from({ length: q.max }, (_, i) => i + 1).map(num => `
          <input type="radio" id="${q.id}_${num}" name="${q.name}" value="${num}"
            class="visually-hidden"
            ${String(data[q.name]) === String(num) ? 'checked' : ''}>
          <label for="${q.id}_${num}"
            class="option-label flex items-center justify-center border-2 rounded-full font-bold cursor-pointer transition-all duration-200 w-12 h-12 sm:w-14 sm:h-14 text-lg bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            role="radio" aria-label="Rating ${num}">
            <span>${num}</span>
          </label>`).join('');

        return `
          <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
          <div class="number-scale-group flex justify-around items-center"
            role="radiogroup" aria-labelledby="${q.id}Label" data-question-name="${q.name}">${btns}</div>
          <div class="flex justify-between text-sm mt-2 text-gray-500">
            <span>${q.labels.min}</span><span>${q.labels.max}</span>
          </div>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm hidden mt-2 block"></span>`;
      },
      setupEvents(q, handleNextQuestion, updateData) {
        const container = document.querySelector('.number-scale-group');
        if (!container) return;
        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;
          updateData(q.name, e.target.value);
          applyRadioSelectedStyles(container, q.name);
          scheduleAutoAdvance(handleNextQuestion, AUTOADVANCE_DELAY);
        });
      },
    },

    // ── STAR RATING ──────────────────────────────────────────────────────────
    'star-rating': {
      render(q, data) {
        const stars = Array.from({ length: q.max }, (_, i) => q.max - i).map(num => `
          <input type="radio" id="${q.id}_${num}" name="${q.name}" value="${num}"
            class="visually-hidden"
            ${String(data[q.name]) === String(num) ? 'checked' : ''}>
          <label for="${q.id}_${num}"
            class="star option-label text-4xl sm:text-5xl pr-1 cursor-pointer transition-colors duration-150
              ${parseInt(data[q.name]) >= num ? 'text-yellow-400' : 'text-gray-300'}"
            role="radio" aria-label="${num} stars">★</label>`).join('');

        return `
          <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
          <div class="star-rating flex flex-row-reverse justify-center mt-2"
            role="radiogroup" aria-labelledby="${q.id}Label" data-question-name="${q.name}">${stars}</div>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm hidden mt-2 block"></span>`;
      },
      setupEvents(q, handleNextQuestion, updateData) {
        const container = document.querySelector('.star-rating');
        if (!container) return;
        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;
          updateData(q.name, e.target.value);
          applyStarSelectedStyles(container, e.target.value);
          scheduleAutoAdvance(handleNextQuestion, AUTOADVANCE_DELAY);
        });
      },
    },

    // ── RADIO WITH OTHER ─────────────────────────────────────────────────────
    'radio-with-other': {
      render(q, data) {
        const savedVal  = data[q.name];
        const mainVal   = savedVal && typeof savedVal === 'object' ? savedVal.main  : savedVal;
        const otherVal  = savedVal && typeof savedVal === 'object' ? savedVal.other : '';
        const showOther = mainVal === 'Other';

        const n    = q.options.length;
        const cols = getGridCols(n);
        const maxW = getGridMaxWidth(n, cols);

        const opts = q.options.map(opt => {
          // v5.1.0: multi-line labels use <span class="block"> to stack centered
          const labelHtml = typeof opt.label === 'object'
            ? `<span class="block">${opt.label.line1}</span><span class="block">${opt.label.line2}</span>`
            : opt.label;
          const isSelected = mainVal === opt.value;
          return `
            <input type="radio" id="${q.id}_${opt.value.replace(/\s+/g,'_')}"
              name="${q.name}" value="${opt.value}"
              class="visually-hidden" ${isSelected ? 'checked' : ''}>
            <label for="${q.id}_${opt.value.replace(/\s+/g,'_')}"
              class="option-label px-3 py-3 text-center text-sm sm:text-base font-medium border-2 rounded-lg cursor-pointer transition-all duration-200
                ${isSelected
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}"
              role="radio">${labelHtml}</label>`;
        }).join('');

        return `
          <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
          <div class="location-radio-group"
            style="display:grid; grid-template-columns:repeat(${cols},1fr); gap:8px; ${maxW}"
            role="radiogroup" aria-labelledby="${q.id}Label" data-question-name="${q.name}">${opts}</div>
          <div id="other-${q.id}-container" class="mt-4 ${showOther ? '' : 'hidden'}">
            <input type="text" id="other-${q.id}-text" name="other-${q.id}"
              class="shadow-sm border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700"
              placeholder="Please specify" value="${otherVal || ''}">
            <span id="other-${q.id}-textError" class="error-message text-red-500 text-sm hidden mt-1"></span>
          </div>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm hidden mt-2 block"></span>`;
      },
      setupEvents(q, handleNextQuestion, updateData) {
        const container      = document.querySelector('.location-radio-group');
        const otherContainer = document.getElementById(`other-${q.id}-container`);
        const otherInput     = document.getElementById(`other-${q.id}-text`);
        if (!container) return;

        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;
          const val = e.target.value;
          updateData(q.name, { main: val, other: val === 'Other' ? (otherInput?.value || '') : '' });
          applyRadioSelectedStyles(container, q.name);
          if (otherContainer) {
            if (val === 'Other') {
              otherContainer.classList.remove('hidden');
              otherInput?.focus();
            } else {
              otherContainer.classList.add('hidden');
              if (otherInput) otherInput.value = '';
            }
          }
          if (val !== 'Other') scheduleAutoAdvance(handleNextQuestion, AUTOADVANCE_DELAY);
        });

        if (otherInput) {
          otherInput.addEventListener('input', e => {
            updateData(q.name, { main: 'Other', other: e.target.value });
          });
        }
      },
    },

    // ── RADIO (Age, and any simple radio) ────────────────────────────────────
    radio: {
      render(q, data) {
        const n    = q.options.length;
        const cols = getGridCols(n);
        const maxW = getGridMaxWidth(n, cols);

        const opts = q.options.map(opt => {
          const isSelected = data[q.name] === opt.value;
          return `
            <input type="radio" id="${q.id}_${opt.value.replace(/\s+/g,'_')}"
              name="${q.name}" value="${opt.value}"
              class="visually-hidden" ${isSelected ? 'checked' : ''}>
            <label for="${q.id}_${opt.value.replace(/\s+/g,'_')}"
              class="option-label px-3 py-3 text-center text-sm sm:text-base font-medium border-2 rounded-lg cursor-pointer transition-all duration-200
                ${isSelected
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}"
              role="radio">${opt.label}</label>`;
        }).join('');

        return `
          <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
          <div class="age-radio-group"
            style="display:grid; grid-template-columns:repeat(${cols},1fr); gap:8px; ${maxW}"
            role="radiogroup" aria-labelledby="${q.id}Label" data-question-name="${q.name}">${opts}</div>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm hidden mt-2 block"></span>`;
      },
      setupEvents(q, handleNextQuestion, updateData) {
        const container = document.querySelector('.age-radio-group');
        if (!container) return;
        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;
          updateData(q.name, e.target.value);
          applyRadioSelectedStyles(container, q.name);
          scheduleAutoAdvance(handleNextQuestion, AUTOADVANCE_DELAY);
        });
      },
    },

    // ── RADIO WITH FOLLOWUP ───────────────────────────────────────────────────
    'radio-with-followup': {
      render(q, data) {
        const current      = data[q.name] || {};
        const mainVal      = typeof current === 'object' ? current.main  : current;
        const followupVals = Array.isArray(current.followup) ? current.followup : [];

        const n    = q.options.length;
        const cols = getGridCols(n);
        const maxW = getGridMaxWidth(n, cols);

        const opts = q.options.map(opt => {
          const isSelected = mainVal === opt.value;
          const optSlug    = opt.value.replace(/\s+/g,'_').replace(/'/g,'');
          return `
            <input type="radio" id="${q.id}_${optSlug}" name="${q.name}"
              value="${opt.value}" class="visually-hidden" ${isSelected ? 'checked' : ''}>
            <label for="${q.id}_${optSlug}"
              class="option-label px-3 py-3 text-center text-sm sm:text-base font-medium border-2 rounded-lg cursor-pointer transition-all duration-200
                ${isSelected
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}"
              role="radio">${opt.label}</label>`;
        }).join('');

        const followupHtml = q.options.map(opt => {
          if (!opt.followupLabel || !opt.followupOptions.length) return '';
          const optSlug = opt.value.replace(/\s+/g,'_').replace(/'/g,'');
          const show    = mainVal === opt.value;

          // Followup option cols
          const fn    = opt.followupOptions.length;
          const fcols = getGridCols(fn);
          const fmaxW = getGridMaxWidth(fn, fcols);

          const cbOptions = opt.followupOptions.map(fv => {
            const fvSlug  = fv.replace(/\s+/g,'_').replace(/'/g,'');
            const fid     = `${q.id}_fu_${optSlug}_${fvSlug}`;
            const checked = followupVals.includes(fv);
            return `
              <div class="checkbox-tab-wrapper">
                <input type="checkbox" id="${fid}" name="${q.id}_followup_${optSlug}"
                  value="${fv}" class="visually-hidden" ${checked ? 'checked' : ''}>
                <label for="${fid}"
                  class="option-label followup-option-label inline-block px-4 py-2 font-medium border-2 rounded-lg cursor-pointer transition-all duration-200 select-none
                    ${checked
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}">
                  ${fv}
                </label>
              </div>`;
          }).join('');

          return `
            <div id="${q.id}_followup_${optSlug}" class="mt-4 ${show ? '' : 'hidden'}">
              <p class="followup-panel-label">${opt.followupLabel}</p>
              <div class="followup-radio-group"
                style="display:grid; grid-template-columns:repeat(${fcols},1fr); gap:8px; ${fmaxW}">
                ${cbOptions}
              </div>
            </div>`;
        }).join('');

        return `
          <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
          <div class="followup-radio-group"
            style="display:grid; grid-template-columns:repeat(${cols},1fr); gap:8px; ${maxW}"
            role="radiogroup" aria-labelledby="${q.id}Label" data-question-name="${q.name}">${opts}</div>
          ${followupHtml}
          <span id="${q.id}Error" class="error-message text-red-500 text-sm hidden mt-2 block"></span>`;
      },

      setupEvents(q, handleNextQuestion, updateData) {
        const container = document.querySelector('.followup-radio-group');
        if (!container) return;

        const getFollowupValues = () => {
          const visiblePanel = Array.from(
            document.querySelectorAll(`[id^="${q.id}_followup_"]`)
          ).find(p => !p.classList.contains('hidden'));
          if (!visiblePanel) return [];
          return Array.from(
            visiblePanel.querySelectorAll('input[type="checkbox"]:checked')
          ).map(cb => cb.value);
        };

        const saveData = (mainVal) => {
          updateData(q.name, { main: mainVal, followup: getFollowupValues() });
        };

        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;
          const val = e.target.value;
          applyRadioSelectedStyles(container, q.name);

          q.options.forEach(opt => {
            const slug  = opt.value.replace(/\s+/g,'_').replace(/'/g,'');
            const panel = document.getElementById(`${q.id}_followup_${slug}`);
            if (panel) panel.classList.toggle('hidden', opt.value !== val);
          });

          saveData(val);

          const activeOpt = q.options.find(o => o.value === val);
          if (!activeOpt?.followupLabel || !activeOpt.followupOptions.length) {
            scheduleAutoAdvance(handleNextQuestion, AUTOADVANCE_DELAY);
          }
        });

        document.addEventListener('change', e => {
          if (!e.target.name?.startsWith(`${q.id}_followup_`)) return;
          const mainVal = container.querySelector('input:checked')?.value || '';
          saveData(mainVal);

          const lbl = document.querySelector(`label[for="${e.target.id}"]`);
          if (!lbl) return;
          if (e.target.checked) {
            lbl.classList.add('bg-orange-500', 'text-white', 'border-orange-500');
            lbl.classList.remove('bg-white', 'text-gray-700', 'border-gray-300', 'hover:bg-gray-50');
          } else {
            lbl.classList.remove('bg-orange-500', 'text-white', 'border-orange-500');
            lbl.classList.add('bg-white', 'text-gray-700', 'border-gray-300', 'hover:bg-gray-50');
          }
        });
      },
    },

    // ── CHECKBOX WITH OTHER ──────────────────────────────────────────────────
    'checkbox-with-other': {
      render(q, data) {
        const selectedValues = Array.isArray(data[q.name]) ? data[q.name] : [];
        const otherVal       = data['other' + q.id] || '';

        const n    = q.options.length;
        const cols = getGridCols(n);
        const maxW = getGridMaxWidth(n, cols);

        const opts = q.options.map(opt => {
          const isSelected = selectedValues.includes(opt.value);
          return `
            <div class="checkbox-tab-wrapper">
              <input type="checkbox" id="${q.id}_${opt.value.replace(/\s+/g,'_')}"
                name="${q.name}" value="${opt.value}"
                class="visually-hidden" ${isSelected ? 'checked' : ''}>
              <label for="${q.id}_${opt.value.replace(/\s+/g,'_')}"
                class="option-label flex items-start px-3 py-3 text-sm sm:text-base font-medium border-2 rounded-lg cursor-pointer transition-all duration-200
                  ${isSelected
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}">
                <span class="checkbox-indicator w-5 h-5 mr-2 border-2 rounded flex items-center justify-center flex-shrink-0
                  ${isSelected ? 'border-white bg-white' : 'border-gray-400 bg-white'}">
                  ${isSelected
                    ? `<svg class="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                       </svg>`
                    : ''}
                </span>
                <span class="flex-1">${opt.label}</span>
              </label>
            </div>`;
        }).join('');

        return `
          <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
          <p class="text-sm text-gray-600 mb-3 italic">You can select more than one option</p>
          <div class="checkbox-group"
            style="display:grid; grid-template-columns:repeat(${cols},1fr); gap:8px; ${maxW}"
            role="group" aria-labelledby="${q.id}Label" data-question-name="${q.name}">${opts}</div>
          <div id="other-${q.id}-container" class="mt-4 ${selectedValues.includes('Other') ? '' : 'hidden'}">
            <input type="text" id="other-${q.id}-text" name="other-${q.id}"
              class="shadow-sm border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700"
              placeholder="Please specify" value="${otherVal}">
            <span id="other-${q.id}-textError" class="error-message text-red-500 text-sm hidden mt-1"></span>
          </div>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm hidden mt-2 block"></span>`;
      },

      setupEvents(q, handleNextQuestion, updateData) {
        const container      = document.querySelector('.checkbox-group');
        const otherContainer = document.getElementById(`other-${q.id}-container`);
        const otherInput     = document.getElementById(`other-${q.id}-text`);
        if (!container) return;

        const save = () => {
          const checked = container.querySelectorAll(`input[name="${q.name}"]:checked`);
          const values  = Array.from(checked).map(cb => cb.value);
          updateData(q.name, values);
          updateData('other' + q.id, values.includes('Other') ? (otherInput?.value || '') : '');
        };

        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;
          save();

          container.querySelectorAll('label').forEach(label => {
            const checkbox  = document.getElementById(label.getAttribute('for'));
            const indicator = label.querySelector('.checkbox-indicator');
            if (!checkbox || !indicator) return;
            if (checkbox.checked) {
              label.classList.add('bg-orange-500', 'text-white', 'border-orange-500');
              label.classList.remove('bg-white', 'text-gray-700', 'hover:bg-gray-50', 'border-gray-300');
              indicator.classList.add('border-white', 'bg-white');
              indicator.classList.remove('border-gray-400');
              indicator.innerHTML = `<svg class="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
              </svg>`;
            } else {
              label.classList.remove('bg-orange-500', 'text-white', 'border-orange-500');
              label.classList.add('bg-white', 'text-gray-700', 'hover:bg-gray-50', 'border-gray-300');
              indicator.classList.remove('border-white', 'bg-white');
              indicator.classList.add('border-gray-400');
              indicator.innerHTML = '';
            }
          });

          if (otherContainer) {
            const values = Array.from(
              container.querySelectorAll(`input[name="${q.name}"]:checked`)
            ).map(cb => cb.value);
            if (values.includes('Other')) {
              otherContainer.classList.remove('hidden');
              otherInput?.focus();
            } else {
              otherContainer.classList.add('hidden');
              if (otherInput) otherInput.value = '';
            }
          }
        });

        if (otherInput) {
          otherInput.addEventListener('input', () => save());
        }
      },
    },

  }; // end questionRenderers

  return { surveyQuestions: surveyQuestionsType1, getSurveyQuestions, questionRenderers, kioskId };

})();
