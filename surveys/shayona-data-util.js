// FILE: surveys/shayona-data-util.js
// VERSION: 2.1.0
// CHANGES FROM 2.0.0:
//   - UPDATE: visitPurpose option labels rewritten for clean on-screen display
//     Values unchanged — branch logic unaffected.

window.shayonaDataUtils = (function () {

  // ─── CONFIG ──────────────────────────────────────────────────────────────
  const AUTOADVANCE_DELAY = window.CONSTANTS?.AUTOADVANCE_DELAY_MS ?? 50;
  let autoAdvanceTimer = null;

  function scheduleAutoAdvance(callback, delay) {
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = setTimeout(() => { autoAdvanceTimer = null; callback(); }, delay);
  }

  function clearAutoAdvance() {
    if (autoAdvanceTimer) { clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null; }
  }

  // ─── GRID HELPERS ────────────────────────────────────────────────────────
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

  // ─── STYLE HELPERS ───────────────────────────────────────────────────────
  function applyRadioSelectedStyles(container) {
    container.querySelectorAll('label').forEach(label => {
      const input = document.getElementById(label.getAttribute('for'));
      if (!input) return;
      if (input.checked) {
        label.style.background    = 'var(--orange-light)';
        label.style.borderColor   = 'var(--orange)';
        label.style.color         = 'var(--orange-dark)';
        label.style.borderWidth   = '2px';
      } else {
        label.style.background    = '';
        label.style.borderColor   = '';
        label.style.color         = '';
        label.style.borderWidth   = '';
      }
    });
  }

  function applyChipSelectedStyle(label, isSelected) {
    if (isSelected) {
      label.style.background    = 'var(--orange-light)';
      label.style.borderColor   = 'var(--orange)';
      label.style.color         = 'var(--orange-dark)';
      label.style.borderWidth   = '2px';
    } else {
      label.style.background    = '';
      label.style.borderColor   = '';
      label.style.color         = '';
      label.style.borderWidth   = '';
    }
  }

  function applyStarSelectedStyles(container, selectedValue) {
    container.querySelectorAll('label.star').forEach(label => {
      const input  = document.getElementById(label.getAttribute('for'));
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

  function otherKey(qName) { return `other_${qName}`; }

  // ─── SURVEY QUESTIONS TYPE 3 ─────────────────────────────────────────────
  const surveyQuestionsType3 = [

    // ── SECTION 1: IDENTITY & FIRST IMPRESSION ──────────────────────────────

    {
      id: 'cafeExperience',
      name: 'cafeExperience',
      type: 'emoji-radio',
      question: 'How was your experience at Shayona Café today?',
      options: [
        { value: 'Not as expected', label: 'Not as expected', emoji: '🙁' },
        { value: 'Okay',            label: 'Okay',            emoji: '😐' },
        { value: 'Good',            label: 'Good',            emoji: '🙂' },
        { value: 'Excellent',       label: 'Excellent',       emoji: '😊' },
      ],
      required: true,
    },

    {
      id: 'visitPurpose',
      name: 'visitPurpose',
      type: 'radio',
      question: 'What was the primary reason for your visit today?',
      options: [
        { value: 'Grab & Go',                      label: 'Packaged Snacks or Sweets'       },
        { value: 'Hot Food',                        label: 'Hot Food & Snacks'               },
        { value: 'Buffet',                          label: 'Buffet / Thali'                  },
        { value: 'Catering',                        label: 'Catering Inquiry / Large Order'  },
        { value: 'Browsing',                        label: 'Just Browsing'                   },
        { value: 'Wanted to purchase, but did not', label: 'Wanted to Purchase, but Did Not' },
      ],
      required: true,
    },

    // ── SECTION 2: SYSTEM EFFICIENCY ────────────────────────────────────────
    // Shown to purchasers only (Grab & Go, Hot Food, Buffet, Catering)
    // Browsing + Failed Intent skip directly to their branch

    {
      id: 'waitTime',
      name: 'waitTime',
      type: 'radio',
      question: 'How long did you wait today?',
      branch: 'purchaser',
      options: [
        { value: 'Under 5 min', label: 'Under 5 minutes' },
        { value: '5–10 min',    label: '5–10 minutes'    },
        { value: '10–15 min',   label: '10–15 minutes'   },
        { value: '15+ min',     label: '15+ minutes'     },
      ],
      required: true,
    },

    {
      id: 'waitAcceptable',
      name: 'waitAcceptable',
      type: 'radio-with-followup',
      question: 'Was this wait time acceptable?',
      branch: 'purchaser',
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
      branch: 'purchaser',
      options: [
        { value: 'Very smooth',   label: 'Very smooth'   },
        { value: 'Mostly smooth', label: 'Mostly smooth' },
        { value: 'Some friction', label: 'Some friction' },
        { value: 'Frustrating',   label: 'Frustrating'   },
      ],
      required: true,
    },

    // ── SECTION 3: BRANCH A — GRAB & GO ─────────────────────────────────────

    {
      id: 'headerGrabGo',
      name: 'headerGrabGo',
      type: 'section-header',
      text: 'About your Grab & Go experience today…',
      branch: 'Grab & Go',
    },

    {
      id: 'grabGoFinding',
      name: 'grabGoFinding',
      type: 'radio-with-followup',
      question: 'How easy was it to find what you were looking for?',
      branch: 'Grab & Go',
      options: [
        { value: 'Very easy',          label: 'Very easy',          followupLabel: null, followupOptions: [] },
        { value: 'Somewhat easy',      label: 'Somewhat easy',      followupLabel: null, followupOptions: [] },
        { value: 'Somewhat difficult', label: 'Somewhat difficult', followupLabel: 'What made it difficult?', followupOptions: ['Items were hard to locate', 'Labels or prices were unclear', 'Too crowded around display', 'Could not decide quickly'] },
        { value: 'Very difficult',     label: 'Very difficult',     followupLabel: 'What made it difficult?', followupOptions: ['Items were hard to locate', 'Labels or prices were unclear', 'Too crowded around display', 'Could not decide quickly'] },
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

    // ── SECTION 3: BRANCH B — HOT FOOD / BUFFET ─────────────────────────────

    {
      id: 'headerHotFood',
      name: 'headerHotFood',
      type: 'section-header',
      text: 'About your food experience today…',
      branch: 'Hot Food|Buffet',
    },

    {
      id: 'foodPriority',
      name: 'foodPriority',
      type: 'radio',
      question: 'What mattered most to you today?',
      branch: 'Hot Food|Buffet',
      options: [
        { value: 'Speed of service',     label: 'Speed of service'     },
        { value: 'Food quality & taste', label: 'Food quality & taste' },
        { value: 'Value for money',      label: 'Value for money'      },
        { value: 'Balanced experience',  label: 'Balanced experience'  },
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
        { key: 'taste', label: 'Food taste'     },
        { key: 'value', label: 'Value for money' },
      ],
      min: 1,
      max: 5,
      required: true,
    },

    // ── SECTION 3: BRANCH C — CATERING ──────────────────────────────────────

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
        { value: 'Yes, fully clear', label: 'Yes, fully clear', followupLabel: null, followupOptions: [] },
        { value: 'Partially clear',  label: 'Partially clear',  followupLabel: 'What was missing?', followupOptions: ['Pricing details', 'Menu / options clarity', 'Staff availability', 'Response time', 'Other'] },
        { value: 'Mostly unclear',   label: 'Mostly unclear',   followupLabel: 'What was missing?', followupOptions: ['Pricing details', 'Menu / options clarity', 'Staff availability', 'Response time', 'Other'] },
        { value: 'Not clear at all', label: 'Not clear at all', followupLabel: 'What was missing?', followupOptions: ['Pricing details', 'Menu / options clarity', 'Staff availability', 'Response time', 'Other'] },
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
        { value: 'Online menu / brochure',    label: 'Online menu / brochure'    },
        { value: 'Dedicated staff member',    label: 'Dedicated staff member'    },
        { value: 'Faster response time',      label: 'Faster response time'      },
        { value: 'Better signage / guidance', label: 'Better signage / guidance' },
      ],
      required: true,
    },

    // ── SECTION 3: BRANCH D1 — FAILED INTENT ────────────────────────────────

    {
      id: 'headerFailedIntent',
      name: 'headerFailedIntent',
      type: 'section-header',
      text: 'We\'re sorry we couldn\'t serve you today — your feedback helps us improve.',
      branch: 'Failed Intent',
    },

    {
      id: 'browsingBarrier',
      name: 'browsingBarrier',
      type: 'radio',
      question: 'What was the main reason you didn\'t purchase today?',
      branch: 'Failed Intent',
      options: [
        { value: 'Wait or line was too long',      label: 'The wait or line was too long'              },
        { value: 'No staff available',             label: 'No staff was available to help or take my order' },
        { value: 'Did not find specific item',     label: 'I did not see the specific item I wanted'   },
        { value: 'Prices were not clearly marked', label: 'Prices were not clearly marked'             },
      ],
      required: true,
    },

    // ── SECTION 3: BRANCH D2 — CASUAL BROWSER ───────────────────────────────

    {
      id: 'headerBrowsing',
      name: 'headerBrowsing',
      type: 'section-header',
      text: 'Thanks for stopping by — we\'d love to know what brought you in today.',
      branch: 'Browsing',
    },

    {
      id: 'browsingDiscovery',
      name: 'browsingDiscovery',
      type: 'radio',
      question: 'What were you hoping to find today?',
      branch: 'Browsing',
      options: [
        { value: 'Exploring for the first time',   label: 'Just exploring the café for the first time' },
        { value: 'Checking menu for future visit',  label: 'Checking the menu for a future visit'       },
        { value: 'Looking for a specific snack',   label: 'Looking for a specific snack or sweet'      },
        { value: 'Looking for a gift or souvenir', label: 'Looking for a gift or souvenir'             },
        { value: 'Checking for seating / space',   label: 'Checking for seating or a place to sit'     },
      ],
      required: false,
    },

    // ── SECTION 4: EMOTIONAL CLOSURE (all users) ────────────────────────────

    {
      id: 'finalThoughts',
      name: 'final_thoughts',
      type: 'selector-textarea',
      question: 'What would you like to share about your visit to Shayona Café?',
      subLabel: 'Optional — select one to begin',
      options: [
        { value: 'shoutout',    label: 'A shout-out to the team', emoji: '🌟', placeholder: 'A big thank you to '              },
        { value: 'improvement', label: 'An idea for improvement',  emoji: '💡', placeholder: 'One thing that could be better is ' },
        { value: 'favourite',   label: 'My favourite part',        emoji: '❤️', placeholder: 'My favourite part was '            },
        { value: 'issue',       label: 'Something didn\'t work',   emoji: '⚠️', placeholder: 'Something didn\'t work — '        },
        { value: 'other',       label: 'Something else',           emoji: '📝', placeholder: 'I wanted to share that '           },
      ],
      defaultPlaceholder: 'Share your thoughts about the café here…',
      required: false,
    },

  ];

  // ─── BRANCHING LOGIC ─────────────────────────────────────────────────────

  function getActiveBranch(formData) {
    const purpose = formData['visitPurpose'] ?? '';
    if (purpose === 'Grab & Go')                        return 'Grab & Go';
    if (purpose === 'Hot Food' || purpose === 'Buffet') return 'Hot Food|Buffet';
    if (purpose === 'Catering')                         return 'Catering';
    if (purpose === 'Wanted to purchase, but did not')  return 'Failed Intent';
    if (purpose === 'Browsing')                         return 'Browsing';
    return null;
  }

  const NON_PURCHASER_BRANCHES = new Set(['Browsing', 'Failed Intent']);

  function isPurchaser(activeBranch) {
    if (activeBranch === null) return true;
    return !NON_PURCHASER_BRANCHES.has(activeBranch);
  }

  function shouldShowQuestion(q, activeBranch, formData) {
    if (q.id === 'waitAcceptable' && formData['waitTime'] === 'Under 5 min') {
      return false;
    }
    if (!q.branch) return true;
    if (activeBranch === null) return true;
    if (q.branch === 'purchaser') return isPurchaser(activeBranch);
    const allowedBranches = q.branch.split('|');
    return allowedBranches.some(b => activeBranch.includes(b));
  }

  function getNextQuestionIndex(currentIndex, formData, questions) {
    const activeBranch = getActiveBranch(formData);
    let next = currentIndex + 1;
    while (next < questions.length) {
      if (shouldShowQuestion(questions[next], activeBranch, formData)) break;
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
      scheduleAutoAdvance(handleNextQuestion, 800);
    },
  };

  // ─── DUAL-STAR-RATING RENDERER ───────────────────────────────────────────
  const dualStarRatingRenderer = {
    render(q, data) {
      const saved = data[q.name] ?? {};

      const rows = q.subRatings.map(sub => {
        const stars = Array.from({ length: q.max }, (_, i) => {
          const num     = q.max - i;
          const checked = saved[sub.key] === num ? 'checked' : '';
          const filled  = saved[sub.key] >= num ? '#FBBF24' : '#D1D5DB';
          return `
            <input type="radio" id="${q.id}_${sub.key}_${num}" name="${q.id}_${sub.key}" value="${num}" class="visually-hidden" ${checked}>
            <label for="${q.id}_${sub.key}_${num}" class="star option-label"
                   style="font-size:2.6rem;padding:0 4px;color:${filled}"
                   role="radio" aria-label="${num} star">★</label>
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

      wrapper.addEventListener('change', () => {
        const current = getCurrent();
        updateData(q.name, current);

        q.subRatings.forEach(sub => {
          const grid = document.getElementById(`${q.id}_${sub.key}_grid`);
          if (grid) applyStarSelectedStyles(grid, current[sub.key] ?? 0);
        });

        if (allFilled()) scheduleAutoAdvance(handleNextQuestion, AUTOADVANCE_DELAY);
      });
    },
  };

  // ─── QUESTION RENDERERS ──────────────────────────────────────────────────
  const questionRenderers = {
    'section-header':   sectionHeaderRenderer,
    'dual-star-rating': dualStarRatingRenderer,
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
if (window.DEVICECONFIG?.kioskMode === 'shayona') {
  window.dataUtils = window.shayonaDataUtils;
  console.info('[shayona-data-util] Proxy guard active — window.dataUtils → shayonaDataUtils');
}
