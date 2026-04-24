// FILE: data-util.js
// VERSION: 5.4.0
// CHANGES FROM 5.3.0:
//   - New question type: selector-textarea (category pill selector + dynamic placeholder textarea)
//   - Type 2 final_thoughts replaced with selector-textarea (4 category prompts)
//   - selector-textarea stores { category, text } shape
//   - surveyQuestions export is now a getter (fixes static type1 snapshot bug)
//   - kioskId removed from this file (unused here — belongs in submit.js)

window.dataUtils = (function () {

  // ─── Config ───────────────────────────────────────────────
  const AUTOADVANCE_DELAY = window.CONSTANTS?.AUTO_ADVANCE_DELAY_MS || 50;

  // Max selections for checkbox questions that have a cap
  // Per-question maxSelections field is the authoritative cap;
  // CHECKBOX_MAX_SELECTIONS is the default used when building type2 experiences.
  const CHECKBOX_MAX_SELECTIONS = 3;

  let autoAdvanceTimer = null;
  function scheduleAutoAdvance(callback, delay) {
    if (autoAdvanceTimer) {
      console.warn('[DATA-UTIL] scheduleAutoAdvance: cancelling existing timer');
      clearTimeout(autoAdvanceTimer);
    }
    autoAdvanceTimer = setTimeout(() => { autoAdvanceTimer = null; callback(); }, delay);
  }

  function clearAutoAdvance() {
    if (autoAdvanceTimer) { clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null; }
  }

  // ─── GRID HELPERS ─────────────────────────────────────────
  // Max cols intentionally capped at 3 — no question currently exceeds 8 options.
  // If a future question needs 4 cols, extend this function explicitly.

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
    if (cols === 1)           return 'max-width:340px; margin-left:auto; margin-right:auto;';
    if (cols === 2 && n <= 4) return 'max-width:400px; margin-left:auto; margin-right:auto;';
    if (cols === 3 && n <= 3) return 'max-width:500px; margin-left:auto; margin-right:auto;';
    return '';
  }

  // ─── STYLE HELPERS ────────────────────────────────────────

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

  function applyStarSelectedStyles(container, selectedValue) {
    container.querySelectorAll('label.star').forEach(label => {
      const input = document.getElementById(label.getAttribute('for'));
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

  // ─── Companion "other" key — normalized, name-based ───────
  // IMPORTANT: validation.js and submit.js must use the same helper
  function otherKey(qName) {
    return `other_${qName}`;
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
      maxSelections: null, // no cap for Type 1 hear-about
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
        { value: 'Art & Architecture',   label: 'Art & Architecture' },
        { value: 'Darshan & Ceremonies', label: 'Darshan & Ceremonies' },
        { value: 'Walking the Grounds',  label: 'Walking the Grounds' },
        { value: 'Shayona Cafe & Shop',  label: 'Shayona Cafe & Shop' },
        { value: 'Volunteers & Service', label: 'Volunteers & Service' },
        { value: 'Time with Family',     label: 'Time with Family' },
      ],
      maxSelections: CHECKBOX_MAX_SELECTIONS,
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
        { value: 'Already visited',      label: 'Already visited',      followupLabel: null, followupOptions: [] },
        { value: 'Going there now',      label: 'Going there now',      followupLabel: null, followupOptions: [] },
        { value: 'Maybe next time',      label: 'Maybe next time',      followupLabel: 'What would help next time?', followupOptions: ["Better signs","More information","See what's offered","Campus map"] },
        { value: "Didn't know about it", label: "Didn't know about it", followupLabel: 'What would help next time?', followupOptions: ["Better signs","More information","See what's offered","Campus map"] },
      ],
      required: true,
    },
    {
      id: 'expectation_met',
      name: 'expectation_met',
      type: 'radio-with-followup',
      question: 'Did your visit flow smoothly today?',
      options: [
        { value: 'Yes everything was smooth', label: 'Yes, everything was smooth', followupLabel: null,                followupOptions: [] },
        { value: 'A few things were unclear', label: 'A few things were unclear',  followupLabel: 'What was unclear?', followupOptions: ['Darshan timing','Finding my way','Signs & directions','Parking'] },
      ],
      required: true,
    },
    {
      // selector-textarea: category pill selector + dynamic placeholder textarea
      // Stores { category, text } — submit.js flattens to two sheet columns:
      //   final_thoughts_category, final_thoughts_text
      id: 'final_thoughts',
      name: 'final_thoughts',
      type: 'selector-textarea',
      question: 'What would you like to share today?',
      subLabel: 'Optional — Select one to begin',
      options: [
        { value: 'thank_you',  label: 'A thank you note',       emoji: '🙏', placeholder: 'Thank you for…'               },
        { value: 'reflection', label: 'A thought or reflection', emoji: '💭', placeholder: 'Today I experienced…'               },
        { value: 'prayer',     label: 'A prayer or wish',        emoji: '✨', placeholder: 'May…'                        },
        { value: 'feedback',   label: 'Feedback',                emoji: '📝', placeholder: 'Any suggestions or thoughts…' },
      ],
      defaultPlaceholder: 'Share your thought, prayer, or thank you note here…',
      required: false,
    },
  ];

  // ─── Active question set resolver ─────────────────────────
  function getSurveyQuestions() {
    const activeType = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';
    return activeType === 'type2' ? surveyQuestionsType2 : surveyQuestionsType1;
  }

  // ─── Question Renderers ───────────────────────────────────
  const questionRenderers = {

    // ── TEXTAREA ───────────────────────────────────────────
    textarea: {
      render(q, data) {
        return `
          <label id="rotatingQuestion" for="${q.id}"
            class="block font-semibold mb-2" aria-live="polite"
            style="font-size:1.2rem; color:var(--text-primary);">${q.question}</label>
          <textarea id="${q.id}" name="${q.name}" rows="5"
            class="other-text-input"
            style="min-height:130px; resize:none;"
            placeholder="${q.placeholder}"
            ${q.required ? 'required' : ''}>${data[q.name] || ''}</textarea>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm"></span>`;
      },
      setupEvents(q, handleNextQuestion, updateData) {
        const el = document.getElementById(q.id);
        if (!el) return;
        el.addEventListener('input', e => updateData(q.name, e.target.value));
      },
    },

    // ── SELECTOR TEXTAREA ──────────────────────────────────
    // Renders 4 emoji+label category pills, then a textarea whose
    // placeholder swaps based on which pill is selected.
    // Stores: { category: string|null, text: string }
    // submit.js flattens to: final_thoughts_category + final_thoughts_text
    'selector-textarea': {
      render(q, data) {
        const saved    = data[q.name] || {};
        const selCat   = typeof saved === 'object' ? (saved.category || '') : '';
        const savedTxt = typeof saved === 'object' ? (saved.text     || '') : (saved || '');

        const activePlaceholder = selCat
          ? (q.options.find(o => o.value === selCat)?.placeholder || q.defaultPlaceholder)
          : q.defaultPlaceholder;

        const pills = q.options.map(opt => {
          const isSelected = selCat === opt.value;
          return `
            <div class="checkbox-tab-wrapper">
              <input type="radio"
                id="${q.id}_cat_${opt.value}"
                name="${q.id}_category"
                value="${opt.value}"
                class="visually-hidden"
                ${isSelected ? 'checked' : ''}>
              <label for="${q.id}_cat_${opt.value}"
                class="option-label selector-textarea-pill"
                style="${isSelected
                  ? 'background:var(--orange-light);border-color:var(--orange);color:var(--orange-dark);border-width:2px;'
                  : ''}">
                <span style="font-size:1.5rem; line-height:1;">${opt.emoji}</span>
                <span style="font-size:0.88rem; font-weight:500; text-align:center; line-height:1.3;">${opt.label}</span>
              </label>
            </div>`;
        }).join('');

        return `
          <label id="${q.id}Label"
            style="font-size:1.2rem; font-weight:600; color:var(--text-primary); display:block; margin-bottom:2px;">
            ${q.question}
          </label>
          <p style="font-size:0.85rem; color:var(--text-secondary); font-style:italic; margin-bottom:10px;">
            ${q.subLabel}
          </p>
          <div class="selector-textarea-pills"
            id="${q.id}_pillGrid"
            role="radiogroup"
            aria-labelledby="${q.id}Label">${pills}</div>
          <textarea
            id="${q.id}_text"
            name="${q.name}_text"
            rows="4"
            class="other-text-input"
            style="min-height:110px; resize:none; margin-top:12px;"
            placeholder="${activePlaceholder}"
            aria-label="Your response">${savedTxt}</textarea>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm"></span>`;
      },

      setupEvents(q, handleNextQuestion, updateData) {
        const pillGrid = document.getElementById(`${q.id}_pillGrid`);
        const textarea = document.getElementById(`${q.id}_text`);
        if (!pillGrid || !textarea) return;

        const save = () => {
          const checkedPill = pillGrid.querySelector('input[type="radio"]:checked');
          updateData(q.name, {
            category: checkedPill ? checkedPill.value : null,
            text:     textarea.value.trim(),
          });
        };

        // Pill selection — swap placeholder, apply styles, save
        pillGrid.addEventListener('change', e => {
          if (e.target.name !== `${q.id}_category`) return;

          // Apply selected styles to all pills
          pillGrid.querySelectorAll('label').forEach(lbl => {
            const inp = document.getElementById(lbl.getAttribute('for'));
            if (!inp) return;
            applyChipSelectedStyle(lbl, inp.checked);
          });

          // Swap textarea placeholder
          const opt = q.options.find(o => o.value === e.target.value);
          textarea.placeholder = opt?.placeholder || q.defaultPlaceholder;

          // Focus textarea after category selected — invites typing immediately
          textarea.focus();

          save();
        });

        // Textarea input — just save, no auto-advance (optional field)
        textarea.addEventListener('input', () => save());
      },
    },

    // ── EMOJI RADIO — always 4 cols, single row ─────────────
    'emoji-radio': {
      render(q, data) {
        const opts = q.options.map(opt => `
          <input type="radio"
            id="${q.id}_${opt.value.replace(/\s+/g,'_')}"
            name="${q.name}" value="${opt.value}"
            class="visually-hidden"
            ${data[q.name] === opt.value ? 'checked' : ''}>
          <label for="${q.id}_${opt.value.replace(/\s+/g,'_')}"
            class="option-label">
            <span style="font-size:2.2rem; line-height:1;">${opt.emoji}</span>
            <span style="font-size:0.9rem; font-weight:500; text-align:center; line-height:1.2;">${opt.label}</span>
          </label>`).join('');

        return `
          <label id="${q.id}Label"
            style="font-size:1.2rem; font-weight:600; color:var(--text-primary); margin-bottom:4px; display:block;">
            ${q.question}
          </label>
          <div class="emoji-radio-group"
            id="${q.id}_emojiGrid"
            role="radiogroup" aria-labelledby="${q.id}Label">${opts}</div>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm"></span>`;
      },
      setupEvents(q, handleNextQuestion, updateData) {
        const container = document.getElementById(`${q.id}_emojiGrid`);
        if (!container) return;
        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;
          updateData(q.name, e.target.value);
          scheduleAutoAdvance(handleNextQuestion, AUTOADVANCE_DELAY);
        });
      },
    },

    // ── NUMBER SCALE ───────────────────────────────────────
    'number-scale': {
      render(q, data) {
        const btns = Array.from({ length: q.max }, (_, i) => i + 1).map(num => `
          <input type="radio"
            id="${q.id}_${num}" name="${q.name}" value="${num}"
            class="visually-hidden"
            ${Number(data[q.name]) === num ? 'checked' : ''}>
          <label for="${q.id}_${num}"
            class="option-label"
            role="radio" aria-label="Rating ${num}">
            <span>${num}</span>
          </label>`).join('');

        return `
          <label id="${q.id}Label"
            style="font-size:1.2rem; font-weight:600; color:var(--text-primary); display:block; margin-bottom:4px;">
            ${q.question}
          </label>
          <div class="number-scale-group"
            id="${q.id}_scaleGrid"
            role="radiogroup" aria-labelledby="${q.id}Label">${btns}</div>
          <div style="display:flex; justify-content:space-between; font-size:0.82rem; color:var(--text-muted); margin-top:6px;">
            <span>${q.labels.min}</span><span>${q.labels.max}</span>
          </div>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm"></span>`;
      },
      setupEvents(q, handleNextQuestion, updateData) {
        const container = document.getElementById(`${q.id}_scaleGrid`);
        if (!container) return;
        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;
          // Store as Number — avoids string/number comparison bugs in validator
          updateData(q.name, Number(e.target.value));
          applyRadioSelectedStyles(container);
          scheduleAutoAdvance(handleNextQuestion, AUTOADVANCE_DELAY);
        });
      },
    },

    // ── STAR RATING ────────────────────────────────────────
    'star-rating': {
      render(q, data) {
        const stars = Array.from({ length: q.max }, (_, i) => q.max - i).map(num => `
          <input type="radio"
            id="${q.id}_${num}" name="${q.name}" value="${num}"
            class="visually-hidden"
            ${Number(data[q.name]) === num ? 'checked' : ''}>
          <label for="${q.id}_${num}"
            class="star option-label"
            style="font-size:2.6rem; padding:0 4px; color:${parseInt(data[q.name]) >= num ? '#FBBF24' : '#D1D5DB'};"
            role="radio" aria-label="${num} stars">★</label>`).join('');

        return `
          <label id="${q.id}Label"
            style="font-size:1.2rem; font-weight:600; color:var(--text-primary); display:block; margin-bottom:4px;">
            ${q.question}
          </label>
          <div class="star-rating"
            id="${q.id}_starGrid"
            role="radiogroup" aria-labelledby="${q.id}Label">${stars}</div>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm"></span>`;
      },
      setupEvents(q, handleNextQuestion, updateData) {
        const container = document.getElementById(`${q.id}_starGrid`);
        if (!container) return;
        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;
          // Store as Number
          updateData(q.name, Number(e.target.value));
          applyStarSelectedStyles(container, e.target.value);
          scheduleAutoAdvance(handleNextQuestion, AUTOADVANCE_DELAY);
        });
      },
    },

    // ── RADIO WITH OTHER ───────────────────────────────────
    'radio-with-other': {
      render(q, data) {
        // Always read from { main, other } shape
        const saved     = data[q.name];
        const mainVal   = saved && typeof saved === 'object' ? saved.main  : (saved || '');
        const otherVal  = saved && typeof saved === 'object' ? saved.other : (data[otherKey(q.name)] || '');
        const showOther = mainVal === 'Other';

        const n    = q.options.length;
        const cols = getTextGridCols(n);
        const maxW = getGridMaxWidth(n, cols);

        const opts = q.options.map(opt => {
          const labelHtml = typeof opt.label === 'object'
            ? `<span style="display:block;text-align:center;">${opt.label.line1}</span>
               <span style="display:block;text-align:center;">${opt.label.line2}</span>`
            : opt.label;
          const isSelected = mainVal === opt.value;
          return `
            <input type="radio"
              id="${q.id}_${opt.value.replace(/\s+/g,'_')}"
              name="${q.name}" value="${opt.value}"
              class="visually-hidden" ${isSelected ? 'checked' : ''}>
            <label for="${q.id}_${opt.value.replace(/\s+/g,'_')}"
              class="option-label location-radio-group-label"
              style="${isSelected
                ? 'background:var(--orange-light);border-color:var(--orange);color:var(--orange-dark);border-width:2px;'
                : ''}"
              role="radio">${labelHtml}</label>`;
        }).join('');

        return `
          <label id="${q.id}Label"
            style="font-size:1.2rem; font-weight:600; color:var(--text-primary); display:block; margin-bottom:4px;">
            ${q.question}
          </label>
          <div class="location-radio-group"
            id="${q.id}_radioGrid"
            style="grid-template-columns:repeat(${cols},1fr); ${maxW}"
            role="radiogroup" aria-labelledby="${q.id}Label">${opts}</div>
          <div id="other-${q.id}-container" style="${showOther ? '' : 'display:none;'}">
            <input type="text" id="other-${q.id}-text"
              class="other-text-input"
              placeholder="Please specify…"
              value="${otherVal || ''}">
          </div>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm"></span>`;
      },
      setupEvents(q, handleNextQuestion, updateData) {
        const container      = document.getElementById(`${q.id}_radioGrid`);
        const otherContainer = document.getElementById(`other-${q.id}-container`);
        const otherInput     = document.getElementById(`other-${q.id}-text`);
        if (!container) return;

        const save = (mainVal) => {
          // Always store as { main, other } — validator depends on this shape
          updateData(q.name, {
            main:  mainVal,
            other: mainVal === 'Other' ? (otherInput?.value || '') : '',
          });
        };

        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;
          const val = e.target.value;
          save(val);
          applyRadioSelectedStyles(container);
          if (otherContainer) {
            otherContainer.style.display = val === 'Other' ? '' : 'none';
            if (val === 'Other') otherInput?.focus();
            else if (otherInput) otherInput.value = '';
          }
          if (val !== 'Other') scheduleAutoAdvance(handleNextQuestion, AUTOADVANCE_DELAY);
        });

        otherInput?.addEventListener('input', () => save('Other'));
      },
    },

    // ── RADIO (simple, e.g. Age) ───────────────────────────
    radio: {
      render(q, data) {
        const n    = q.options.length;
        const cols = getTextGridCols(n);
        const maxW = getGridMaxWidth(n, cols);

        const opts = q.options.map(opt => {
          const isSelected = data[q.name] === opt.value;
          return `
            <input type="radio"
              id="${q.id}_${opt.value.replace(/\s+/g,'_')}"
              name="${q.name}" value="${opt.value}"
              class="visually-hidden" ${isSelected ? 'checked' : ''}>
            <label for="${q.id}_${opt.value.replace(/\s+/g,'_')}"
              class="option-label age-radio-group-label"
              style="${isSelected
                ? 'background:var(--orange-light);border-color:var(--orange);color:var(--orange-dark);border-width:2px;'
                : ''}"
              role="radio">${opt.label}</label>`;
        }).join('');

        return `
          <label id="${q.id}Label"
            style="font-size:1.2rem; font-weight:600; color:var(--text-primary); display:block; margin-bottom:4px;">
            ${q.question}
          </label>
          <div class="age-radio-group"
            id="${q.id}_radioGrid"
            style="grid-template-columns:repeat(${cols},1fr); ${maxW}"
            role="radiogroup" aria-labelledby="${q.id}Label">${opts}</div>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm"></span>`;
      },
      setupEvents(q, handleNextQuestion, updateData) {
        const container = document.getElementById(`${q.id}_radioGrid`);
        if (!container) return;
        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;
          // Store as plain string — simple radio has no companion field
          updateData(q.name, e.target.value);
          applyRadioSelectedStyles(container);
          scheduleAutoAdvance(handleNextQuestion, AUTOADVANCE_DELAY);
        });
      },
    },

    // ── RADIO WITH FOLLOWUP ────────────────────────────────
    'radio-with-followup': {
      render(q, data) {
        // Always read from { main, followup[] } shape
        const saved        = data[q.name] || {};
        const mainVal      = typeof saved === 'object' ? (saved.main || '') : (saved || '');
        const followupVals = Array.isArray(saved.followup) ? saved.followup : [];

        const n    = q.options.length;
        const cols = getTextGridCols(n);
        const maxW = getGridMaxWidth(n, cols);

        const opts = q.options.map(opt => {
          const isSelected = mainVal === opt.value;
          const optSlug    = opt.value.replace(/\s+/g,'_').replace(/'/g,'');
          return `
            <input type="radio"
              id="${q.id}_${optSlug}" name="${q.name}"
              value="${opt.value}" class="visually-hidden"
              ${isSelected ? 'checked' : ''}>
            <label for="${q.id}_${optSlug}"
              class="option-label followup-radio-group-label"
              style="${isSelected
                ? 'background:var(--orange-light);border-color:var(--orange);color:var(--orange-dark);border-width:2px;'
                : ''}"
              role="radio">${opt.label}</label>`;
        }).join('');

        const drawers = q.options.map(opt => {
          if (!opt.followupLabel || !opt.followupOptions.length) return '';
          const optSlug = opt.value.replace(/\s+/g,'_').replace(/'/g,'');
          const show    = mainVal === opt.value;

          const chips = opt.followupOptions.map(fv => {
            const fvSlug  = fv.replace(/\s+/g,'_').replace(/'/g,'');
            const fid     = `${q.id}_fu_${optSlug}_${fvSlug}`;
            const checked = followupVals.includes(fv);
            return `
              <div class="checkbox-tab-wrapper">
                <input type="checkbox"
                  id="${fid}"
                  name="${q.id}_followup_${optSlug}"
                  value="${fv}"
                  class="visually-hidden"
                  ${checked ? 'checked' : ''}>
                <label for="${fid}"
                  class="followup-option-label"
                  style="${checked
                    ? 'background:var(--orange-light);border-color:var(--orange);color:var(--orange-dark);border-width:2px;'
                    : ''}">
                  ${fv}
                </label>
              </div>`;
          }).join('');

          return `
            <div id="${q.id}_drawer_${optSlug}"
              class="followup-drawer"
              style="${show ? '' : 'display:none;'}">
              <p class="followup-panel-label">${opt.followupLabel}</p>
              <div class="followup-sub-grid">${chips}</div>
            </div>`;
        }).join('');

        return `
          <label id="${q.id}Label"
            style="font-size:1.2rem; font-weight:600; color:var(--text-primary); display:block; margin-bottom:4px;">
            ${q.question}
          </label>
          <div class="followup-radio-group"
            id="${q.id}_mainGrid"
            style="grid-template-columns:repeat(${cols},1fr); ${maxW}"
            role="radiogroup" aria-labelledby="${q.id}Label">${opts}</div>
          ${drawers}
          <span id="${q.id}Error" class="error-message text-red-500 text-sm"></span>`;
      },

      setupEvents(q, handleNextQuestion, updateData) {
        const container = document.getElementById(`${q.id}_mainGrid`);
        if (!container) return;

        const getFollowupValues = () => {
          const visibleDrawer = Array.from(
            document.querySelectorAll(`[id^="${q.id}_drawer_"]`)
          ).find(p => p.style.display !== 'none');
          if (!visibleDrawer) return [];
          return Array.from(
            visibleDrawer.querySelectorAll('input[type="checkbox"]:checked')
          ).map(cb => cb.value);
        };

        const save = (mainVal) => {
          // Always store as { main, followup[] } — validator depends on this shape
          updateData(q.name, { main: mainVal, followup: getFollowupValues() });
        };

        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;
          const val = e.target.value;

          applyRadioSelectedStyles(container);

          q.options.forEach(opt => {
            const slug   = opt.value.replace(/\s+/g,'_').replace(/'/g,'');
            const drawer = document.getElementById(`${q.id}_drawer_${slug}`);
            if (drawer) drawer.style.display = (opt.value === val && opt.followupOptions.length) ? '' : 'none';
          });

          save(val);

          const activeOpt = q.options.find(o => o.value === val);
          if (!activeOpt?.followupLabel || !activeOpt.followupOptions.length) {
            scheduleAutoAdvance(handleNextQuestion, AUTOADVANCE_DELAY);
          }
        });

        q.options.forEach(opt => {
          if (!opt.followupOptions.length) return;
          const optSlug = opt.value.replace(/\s+/g,'_').replace(/'/g,'');
          const drawer  = document.getElementById(`${q.id}_drawer_${optSlug}`);
          if (!drawer) return;

          drawer.addEventListener('change', e => {
            if (!e.target.name?.startsWith(`${q.id}_followup_`)) return;
            const mainVal = container.querySelector('input:checked')?.value || '';
            save(mainVal);

            const lbl = drawer.querySelector(`label[for="${e.target.id}"]`);
            if (!lbl) return;
            applyChipSelectedStyle(lbl, e.target.checked);
          });
        });
      },
    },

    // ── CHECKBOX WITH OTHER ────────────────────────────────
    'checkbox-with-other': {
      render(q, data) {
        const selectedValues = Array.isArray(data[q.name]) ? data[q.name] : [];
        const otherVal       = data[otherKey(q.name)] || '';
        const cap            = q.maxSelections || null;

        const n    = q.options.length;
        const cols = getTextGridCols(n);
        const maxW = getGridMaxWidth(n, cols);

        const opts = q.options.map(opt => {
          const isSelected = selectedValues.includes(opt.value);
          return `
            <div class="checkbox-tab-wrapper">
              <input type="checkbox"
                id="${q.id}_${opt.value.replace(/\s+/g,'_')}"
                name="${q.name}" value="${opt.value}"
                class="visually-hidden" ${isSelected ? 'checked' : ''}>
              <label for="${q.id}_${opt.value.replace(/\s+/g,'_')}"
                class="option-label checkbox-group-label"
                style="${isSelected
                  ? 'background:var(--orange-light);border-color:var(--orange);color:var(--orange-dark);border-width:2px;'
                  : ''}">
                <span class="checkbox-indicator"
                  style="${isSelected ? 'border-color:#fff;' : ''}">
                  ${isSelected
                    ? `<svg style="width:12px;height:12px;color:var(--orange);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                       </svg>`
                    : ''}
                </span>
                <span style="flex:1;">${opt.label}</span>
              </label>
            </div>`;
        }).join('');

        const capHint = cap
          ? `<p style="font-size:0.85rem; color:var(--text-secondary); font-style:italic; margin-bottom:8px;">
               Select up to ${cap}
             </p>`
          : `<p style="font-size:0.85rem; color:var(--text-secondary); font-style:italic; margin-bottom:8px;">
               You can select more than one option
             </p>`;

        return `
          <label id="${q.id}Label"
            style="font-size:1.2rem; font-weight:600; color:var(--text-primary); display:block; margin-bottom:4px;">
            ${q.question}
          </label>
          ${capHint}
          <div class="checkbox-group"
            id="${q.id}_checkboxGrid"
            style="grid-template-columns:repeat(${cols},1fr); ${maxW}"
            role="group" aria-labelledby="${q.id}Label">${opts}</div>
          <div id="other-${q.id}-container" style="${selectedValues.includes('Other') ? '' : 'display:none;'}">
            <input type="text" id="other-${q.id}-text"
              class="other-text-input"
              placeholder="Please specify…"
              value="${otherVal}">
          </div>
          <span id="${q.id}Error" class="error-message text-red-500 text-sm"></span>`;
      },

      setupEvents(q, handleNextQuestion, updateData) {
        const container      = document.getElementById(`${q.id}_checkboxGrid`);
        const otherContainer = document.getElementById(`other-${q.id}-container`);
        const otherInput     = document.getElementById(`other-${q.id}-text`);
        if (!container) return;

        const cap = q.maxSelections || null;

        const save = () => {
          const values = Array.from(
            container.querySelectorAll(`input[name="${q.name}"]:checked`)
          ).map(cb => cb.value);
          updateData(q.name, values);
          updateData(otherKey(q.name), values.includes('Other') ? (otherInput?.value || '') : '');
        };

        container.addEventListener('change', e => {
          if (e.target.name !== q.name) return;

          if (cap && e.target.checked) {
            const currentlyChecked = Array.from(
              container.querySelectorAll(`input[name="${q.name}"]:checked`)
            );
            if (currentlyChecked.length > cap) {
              e.target.checked = false;
              const errEl = document.getElementById(`${q.id}Error`);
              if (errEl) {
                errEl.textContent = `Maximum ${cap} selections allowed`;
                setTimeout(() => { if (errEl) errEl.textContent = ''; }, 2000);
              }
              return;
            }
          }

          save();

          const lbl       = container.querySelector(`label[for="${e.target.id}"]`);
          const indicator = lbl?.querySelector('.checkbox-indicator');
          if (!lbl || !indicator) return;

          if (e.target.checked) {
            lbl.style.background  = 'var(--orange-light)';
            lbl.style.borderColor = 'var(--orange)';
            lbl.style.color       = 'var(--orange-dark)';
            lbl.style.borderWidth = '2px';
            indicator.style.borderColor = '#fff';
            indicator.innerHTML = `<svg style="width:12px;height:12px;color:var(--orange);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
            </svg>`;
          } else {
            lbl.style.background  = '';
            lbl.style.borderColor = '';
            lbl.style.color       = '';
            lbl.style.borderWidth = '';
            indicator.style.borderColor = '';
            indicator.innerHTML = '';
          }

          if (otherContainer) {
            const values = Array.from(
              container.querySelectorAll(`input[name="${q.name}"]:checked`)
            ).map(cb => cb.value);
            otherContainer.style.display = values.includes('Other') ? '' : 'none';
            if (values.includes('Other')) otherInput?.focus();
            else if (otherInput) otherInput.value = '';
          }
        });

        otherInput?.addEventListener('input', () => save());
      },
    },

  }; // end questionRenderers

  // ─── surveyQuestions as getter — always returns active type ───
  // NOTE: anything calling window.dataUtils.surveyQuestions gets
  // the live active-type set, not a stale type1 snapshot.
  return {
    get surveyQuestions() { return getSurveyQuestions(); },
    getSurveyQuestions,
    questionRenderers,
    otherKey,
    clearAutoAdvance,
  };

})();
