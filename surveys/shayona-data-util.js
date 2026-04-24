// surveys/shayona-data-util.js
// VERSION 1.0.0
// Shayona Café kiosk — standalone data util
// Registers as window.shayonaDataUtils
// When kioskMode === 'shayona', core.js uses this instead of window.dataUtils

window.shayonaDataUtils = (function () {

  // ─── CONFIG ──────────────────────────────────────────────────────────────
  const AUTOADVANCEDELAY = window.CONSTANTS?.AUTOADVANCEDELAYMS ?? 50;
  let autoAdvanceTimer = null;

  function scheduleAutoAdvance(callback, delay) {
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = setTimeout(() => { autoAdvanceTimer = null; callback(); }, delay);
  }

  function clearAutoAdvance() {
    if (autoAdvanceTimer) { clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null; }
  }

  // ─── GRID HELPERS (identical to data-util.js) ────────────────────────────
  function getTextGridCols(n) {
    if (n === 1) return 1;
    if (n === 2) return 2;
    if (n === 3) return 3;
    if (n === 4) return 2;
    return 3;
  }

  function getGridMaxWidth(n, cols) {
    if (cols === 1) return 'max-width:340px;margin-left:auto;margin-right:auto';
    if (cols === 2 && n <= 4) return 'max-width:400px;margin-left:auto;margin-right:auto';
    if (cols === 3 && n === 3) return 'max-width:500px;margin-left:auto;margin-right:auto';
    return '';
  }

  // ─── STYLE HELPERS (identical to data-util.js) ───────────────────────────
  function applyRadioSelectedStyles(container) {
    container.querySelectorAll('label').forEach(label => {
      const input = document.getElementById(label.getAttribute('for'));
      if (!input) return;
      if (input.checked) {
        label.style.background = 'var(--orange-light)';
        label.style.borderColor = 'var(--orange)';
        label.style.color = 'var(--orange-dark)';
        label.style.borderWidth = '2px';
      } else {
        label.style.background = '';
        label.style.borderColor = '';
        label.style.color = '';
        label.style.borderWidth = '';
      }
    });
  }

  function applyChipSelectedStyle(label, isSelected) {
    if (isSelected) {
      label.style.background = 'var(--orange-light)';
      label.style.borderColor = 'var(--orange)';
      label.style.color = 'var(--orange-dark)';
      label.style.borderWidth = '2px';
    } else {
      label.style.background = '';
      label.style.borderColor = '';
      label.style.color = '';
      label.style.borderWidth = '';
    }
  }

  function applyStarSelectedStyles(container, selectedValue) {
    container.querySelectorAll('label.star').forEach(label => {
      const input = document.getElementById(label.getAttribute('for'));
      if (!input) return;
      const starVal = parseInt(input.value, 10);
      const selVal = parseInt(selectedValue, 10);
      if (starVal <= selVal) {
        label.classList.add('text-yellow-400');
        label.classList.remove('text-gray-300');
      } else {
        label.classList.remove('text-yellow-400');
        label.classList.add('text-gray-300');
      }
    });
  }

  // ─── OTHER KEY (must match data-util.js + validation.js) ─────────────────
  function otherKey(qName) { return `other_${qName}`; }

  // ─── SURVEY QUESTIONS TYPE 3 ─────────────────────────────────────────────
  const surveyQuestionsType3 = [

    // ── SECTION 1: CORE EXPERIENCE ──────────────────────────────────────────

    {
      id: 'cafeExperience',
      name: 'cafeExperience',
      type: 'emoji-radio',
      question: 'How was your experience at Shayona Café today?',
      options: [
        { value: 'Excellent',        label: 'Excellent',        emoji: '😊' },
        { value: 'Good',             label: 'Good',             emoji: '🙂' },
        { value: 'Okay',             label: 'Okay',             emoji: '😐' },
        { value: 'Not as expected',  label: 'Not as expected',  emoji: '🙁' },
      ],
      required: true,
    },

    {
      id: 'visitPurpose',
      name: 'visitPurpose',
      type: 'radio',
      question: 'What was the primary reason for your visit today?',
      options: [
        { value: 'Grab & Go',        label: 'Quick snack / sweets (Grab & Go)' },
        { value: 'Hot Food',         label: 'Fresh hot food (Made to order)' },
        { value: 'Buffet',           label: 'Buffet / Thali' },
        { value: 'Catering',         label: 'Catering inquiry / Large order' },
        { value: 'Browsing',         label: 'Just browsing / No purchase' },
        { value: 'Other',            label: 'Other' },
      ],
      required: true,
    },

    // ── SECTION 2: GLOBAL EXPERIENCE (all users) ────────────────────────────

    {
      id: 'waitTime',
      name: 'waitTime',
      type: 'radio',
      question: 'How long did you wait today?',
      options: [
        { value: 'Under 5 min',  label: 'Under 5 minutes' },
        { value: '5–10 min',     label: '5–10 minutes' },
        { value: '10–15 min',    label: '10–15 minutes' },
        { value: '15+ min',      label: '15+ minutes' },
      ],
      required: true,
    },

    {
      id: 'waitAcceptable',
      name: 'waitAcceptable',
      type: 'radio-with-followup',
      question: 'Was this wait time acceptable?',
      options: [
        {
          value: 'Yes',
          label: 'Yes',
          followupLabel: null,
          followupOptions: [],
        },
        {
          value: 'No',
          label: 'No',
          followupLabel: 'What caused the delay?',
          followupOptions: [
            'Long line to order',
            'Waiting to pay',
            'Food preparation was slow',
            'Staff was busy with other customers',
            'Catering / large order in progress',
            'Not sure',
          ],
        },
      ],
      required: true,
    },

    {
      id: 'flowExperience',
      name: 'flowExperience',
      type: 'radio',
      question: 'How did the overall flow of your visit feel?',
      options: [
        { value: 'Very smooth',    label: 'Very smooth' },
        { value: 'Mostly smooth',  label: 'Mostly smooth' },
        { value: 'Some friction',  label: 'Some friction' },
        { value: 'Frustrating',    label: 'Frustrating' },
      ],
      required: true,
    },

    // ── SECTION 3: BRANCHING ────────────────────────────────────────────────
    // Branch A — Grab & Go

    {
      id: 'headerGrabGo',
      name: 'headerGrabGo',
      type: 'section-header',
      text: 'About your Grab & Go experience today…',
      branch: 'Grab & Go',   // shown only when visitPurpose === 'Grab & Go'
    },

    {
      id: 'grabGoFinding',
      name: 'grabGoFinding',
      type: 'radio-with-followup',
      question: 'How easy was it to find what you were looking for?',
      branch: 'Grab & Go',
      options: [
        { value: 'Very easy',        label: 'Very easy',        followupLabel: null, followupOptions: [] },
        { value: 'Somewhat easy',    label: 'Somewhat easy',    followupLabel: null, followupOptions: [] },
        { value: 'Somewhat difficult', label: 'Somewhat difficult', followupLabel: 'What made it difficult?', followupOptions: ['Items were hard to locate', 'Labels or prices were unclear', 'Too crowded around display', 'Could not decide quickly'] },
        { value: 'Very difficult',   label: 'Very difficult',   followupLabel: 'What made it difficult?', followupOptions: ['Items were hard to locate', 'Labels or prices were unclear', 'Too crowded around display', 'Could not decide quickly'] },
      ],
      required: true,
    },

    {
      id: 'grabGoSpeed',
      name: 'grabGoSpeed',
      type: 'radio-with-followup',
      question: 'Was the service speed fast enough for a quick visit?',
      branch: 'Grab & Go',
      options: [
        { value: 'Yes, fast enough', label: 'Yes, fast enough', followupLabel: null, followupOptions: [] },
        { value: 'No, too slow',     label: 'No, too slow',     followupLabel: 'What slowed you down most?', followupOptions: ['Waiting to place order', 'Waiting to pay', 'Staff was busy', 'Could not decide quickly'] },
      ],
      required: true,
    },

    // Branch B — Hot Food / Buffet / Thali

    {
      id: 'headerHotFood',
      name: 'headerHotFood',
      type: 'section-header',
      text: 'About your food experience today…',
      branch: 'Hot Food|Buffet',  // shown for Hot Food OR Buffet
    },

    {
      id: 'foodPriority',
      name: 'foodPriority',
      type: 'radio',
      question: 'What mattered most to you today?',
      branch: 'Hot Food|Buffet',
      options: [
        { value: 'Speed of service',       label: 'Speed of service' },
        { value: 'Food quality & taste',   label: 'Food quality & taste' },
        { value: 'Value for money',        label: 'Value for money' },
        { value: 'Balanced experience',    label: 'Balanced experience' },
      ],
      required: true,
    },

    {
      id: 'foodRating',
      name: 'foodRating',
      type: 'dual-star-rating',
      question: 'How would you rate your food experience?',
      branch: 'Hot Food|Buffet',
      subRatings: [
        { key: 'taste', label: 'Food taste' },
        { key: 'value', label: 'Value for money' },
      ],
      min: 1,
      max: 5,
      required: true,
    },

    // Branch C — Catering

    {
      id: 'headerCatering',
      name: 'headerCatering',
      type: 'section-header',
      text: 'About your catering inquiry today…',
      branch: 'Catering',
    },

    {
      id: 'cateringClarity',
      name: 'cateringClarity',
      type: 'radio-with-followup',
      question: 'Was the catering information clear and helpful?',
      branch: 'Catering',
      options: [
        { value: 'Yes, fully clear',    label: 'Yes, fully clear',    followupLabel: null, followupOptions: [] },
        { value: 'Partially clear',     label: 'Partially clear',     followupLabel: 'What was missing?', followupOptions: ['Pricing details', 'Menu / options clarity', 'Staff availability', 'Response time', 'Other'] },
        { value: 'Mostly unclear',      label: 'Mostly unclear',      followupLabel: 'What was missing?', followupOptions: ['Pricing details', 'Menu / options clarity', 'Staff availability', 'Response time', 'Other'] },
        { value: 'Not clear at all',    label: 'Not clear at all',    followupLabel: 'What was missing?', followupOptions: ['Pricing details', 'Menu / options clarity', 'Staff availability', 'Response time', 'Other'] },
      ],
      required: true,
    },

    {
      id: 'cateringImprovement',
      name: 'cateringImprovement',
      type: 'radio',
      question: 'How can we improve the catering experience?',
      branch: 'Catering',
      options: [
        { value: 'Online menu / brochure',      label: 'Online menu / brochure' },
        { value: 'Dedicated staff member',      label: 'Dedicated staff member' },
        { value: 'Faster response time',        label: 'Faster response time' },
        { value: 'Better signage / guidance',   label: 'Better signage / guidance' },
      ],
      required: true,
    },

    // Branch D — Browsing / No purchase

    {
      id: 'headerBrowsing',
      name: 'headerBrowsing',
      type: 'section-header',
      text: 'About your visit today…',
      branch: 'Browsing',
    },

    {
      id: 'browsingBarrier',
      name: 'browsingBarrier',
      type: 'radio',
      question: 'What stopped you from making a purchase today?',
      branch: 'Browsing',
      options: [
        { value: 'Not enough time / long line',               label: 'Not enough time / long line' },
        { value: 'Did not find something I wanted',           label: 'Did not find something I wanted' },
        { value: 'Menu was unclear',                          label: 'Menu was unclear' },
        { value: 'Prices were unclear',                       label: 'Prices were unclear' },
        { value: 'No one was available to help or take order', label: 'No one was available to help or take order' },
      ],
      required: true,
    },

    // ── SECTION 4: FINAL QUESTION (all users) ───────────────────────────────

    {
      id: 'finalThoughts',
      name: 'finalThoughts',
      type: 'selector-textarea',
      question: 'What would you like to share about your visit to Shayona Café?',
      subLabel: 'Optional — select one to begin',
      options: [
        { value: 'shoutout',     label: 'A shout-out to the team', emoji: '🌟', placeholder: 'A big thank you to ' },
        { value: 'improvement',  label: 'An idea for improvement',  emoji: '💡', placeholder: 'One thing that could be better is ' },
        { value: 'favourite',    label: 'My favourite part',        emoji: '❤️', placeholder: 'My favourite part was ' },
        { value: 'issue',        label: 'Something didn\'t work',   emoji: '⚠️', placeholder: 'Something didn\'t work — ' },
        { value: 'other',        label: 'Something else',           emoji: '📝', placeholder: 'I wanted to share that ' },
      ],
      defaultPlaceholder: 'Share your thoughts about the café here…',
      required: false,
    },

  ];

  // ─── BRANCHING LOGIC ─────────────────────────────────────────────────────
  // Returns the next question index, skipping branch questions that don't
  // match the user's visitPurpose answer.

  function getNextQuestionIndex(currentIndex, formData, questions) {
    const purpose = formData['visitPurpose'] ?? '';

    // Map visitPurpose values to branch keys
    const activeBranch = (() => {
      if (purpose === 'Grab & Go')                    return 'Grab & Go';
      if (purpose === 'Hot Food' || purpose === 'Buffet') return 'Hot Food|Buffet';
      if (purpose === 'Catering')                     return 'Catering';
      if (purpose === 'Browsing' || purpose === 'Other') return 'Browsing';
      return null; // visitPurpose not yet answered — don't skip anything
    })();

    let next = currentIndex + 1;

    while (next < questions.length) {
      const q = questions[next];

      // No branch field = global question, always show
      if (!q.branch) break;

      // Section-headers and branch questions: show only if branch matches
      if (activeBranch === null) break; // purpose unknown, show everything

      // Support pipe-separated multi-branch e.g. 'Hot Food|Buffet'
      const allowedBranches = q.branch.split('|');
      if (allowedBranches.some(b => activeBranch.includes(b))) break;

      // This question belongs to a different branch — skip it
      next++;
    }

    return next;
  }

  // ─── SECTION-HEADER RENDERER ─────────────────────────────────────────────
  const sectionHeaderRenderer = {
    render(q) {
      return `
        <div class="section-header-slide" role="heading" aria-level="2">
          <span class="section-header-text">${q.text}</span>
        </div>
      `;
    },
    setupEvents(q, handleNextQuestion) {
      // Section headers auto-advance immediately
      scheduleAutoAdvance(handleNextQuestion, 800);
    },
  };

  // ─── DUAL-STAR-RATING RENDERER ───────────────────────────────────────────
  const dualStarRatingRenderer = {
    render(q, data) {
      const saved = data[q.name] ?? {};

      const rows = q.subRatings.map(sub => {
        const stars = Array.from({ length: q.max }, (_, i) => {
          const num = q.max - i;
          const checked = saved[sub.key] === num ? 'checked' : '';
          const filled = saved[sub.key] >= num ? '#FBBF24' : '#D1D5DB';
          return `
            <input type="radio" id="${q.id}_${sub.key}_${num}" name="${q.id}_${sub.key}" value="${num}" class="visually-hidden" ${checked}>
            <label for="${q.id}_${sub.key}_${num}" class="star option-label" style="font-size:2.6rem;padding:0 4px;color:${filled}" role="radio" aria-label="${num} star">★</label>
          `;
        }).join('');

        return `
          <div class="dual-star-row">
            <span class="dual-star-label">${sub.label}</span>
            <div class="dual-star-stars" id="${q.id}_${sub.key}_grid" role="radiogroup" aria-label="${sub.label}">
              ${stars}
            </div>
          </div>
        `;
      }).join('');

      return `
        <label id="${q.id}Label" style="font-size:1.2rem;font-weight:600;color:var(--text-primary);display:block;margin-bottom:8px">
          ${q.question}
        </label>
        <div class="dual-star-rating" id="${q.id}_wrapper">
          ${rows}
        </div>
        <span id="${q.id}Error" class="error-message text-red-500 text-sm"></span>
      `;
    },

    setupEvents(q, handleNextQuestion, updateData) {
      const wrapper = document.getElementById(`${q.id}_wrapper`);
      if (!wrapper) return;

      const getCurrent = () => {
        const result = {};
        q.subRatings.forEach(sub => {
          const checked = wrapper.querySelector(`input[name="${q.id}_${sub.key}"]:checked`);
          result[sub.key] = checked ? Number(checked.value) : null;
        });
        return result;
      };

      const allFilled = () => q.subRatings.every(sub =>
        wrapper.querySelector(`input[name="${q.id}_${sub.key}"]:checked`)
      );

      wrapper.addEventListener('change', e => {
        const current = getCurrent();
        updateData(q.name, current);

        // Re-apply star colours for each sub-rating
        q.subRatings.forEach(sub => {
          const grid = document.getElementById(`${q.id}_${sub.key}_grid`);
          if (grid) applyStarSelectedStyles(grid, current[sub.key] ?? 0);
        });

        // Auto-advance only when BOTH sub-ratings are filled
        if (allFilled()) scheduleAutoAdvance(handleNextQuestion, AUTOADVANCEDELAY);
      });
    },
  };

  // ─── QUESTION RENDERERS (extend existing renderers with new types) ────────
  // core.js will look for window.shayonaDataUtils.questionRenderers
  // and merge/override into the active renderer map.

  const questionRenderers = {
    'section-header':    sectionHeaderRenderer,
    'dual-star-rating':  dualStarRatingRenderer,
  };

  // ─── PUBLIC API ──────────────────────────────────────────────────────────
  return {
    get surveyQuestions() { return surveyQuestionsType3; },
    questionRenderers,
    getNextQuestionIndex,
    otherKey,
    clearAutoAdvance,
  };

})();

// ─── PROXY GUARD ─────────────────────────────────────────────────────────────
// If kioskMode is shayona, make window.dataUtils point here so any
// legacy call to window.dataUtils still works correctly on the café iPad.
if (window.DEVICECONFIG?.kioskMode === 'shayona') {
  window.dataUtils = window.shayonaDataUtils;
  console.info('[shayona-data-util] Proxy guard active — window.dataUtils → shayonaDataUtils');
}
