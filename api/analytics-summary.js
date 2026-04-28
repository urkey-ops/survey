// FILE: api/analytics-summary.js
// VERSION: 1.2.0
// CHANGES FROM 1.1.0:
//   - ADD: type3 (Shayona Café) to QUESTION_DEFS — 14 questions mirroring
//     shayona-data-util.js v2.0 including browsingDiscovery (Branch D2)
//   - FIX: query param guard now derives allowed types from QUESTION_DEFS keys
//     dynamically — type3 no longer rejected with 400
//   - FIX: bare GET /api/analytics-summary now builds all defined types
//     (type1 + type2 + type3) instead of hardcoded ['type1', 'type2']
//   - FIX: private_key replace regex over-escaped (/\\\\n/ → /\\n/)
//     matches the same fix applied in submit-survey.js v4.2.0

import { google } from 'googleapis';

// ─── Question definitions ─────────────────────────────────────────────────────
// type1 + type2 unchanged.
// type3 mirrors surveyQuestionsType3 in shayona-data-util.js v2.0.
// Section headers excluded (auto-advance, emit no analytics events).
// Branch questions are included — reachPct will naturally be low for
// questions on branches the visitor didn't take.
const QUESTION_DEFS = {

  type1: [
    { index: 0, id: 'satisfaction',      label: 'Overall Satisfaction'  },
    { index: 1, id: 'cleanliness',       label: 'Cleanliness'           },
    { index: 2, id: 'stafffriendliness', label: 'Staff Friendliness'    },
    { index: 3, id: 'location',          label: 'Where Visiting From'   },
    { index: 4, id: 'age',               label: 'Age Group'             },
    { index: 5, id: 'hearabout',         label: 'How Did You Hear'      },
    { index: 6, id: 'giftshopvisit',     label: 'Shayona Cafe Visit'    },
    { index: 7, id: 'enjoyedmost',       label: 'Comments'              },
  ],

  type2: [
    { index: 0, id: 'satisfaction',    label: 'Overall Satisfaction'    },
    { index: 1, id: 'experiences',     label: 'What Did You Enjoy'      },
    { index: 2, id: 'standout',        label: 'Best Describes Visit'    },
    { index: 3, id: 'shayona_intent',  label: 'Shayona Cafe + Followup' },
    { index: 4, id: 'expectation_met', label: 'Visit Flow + Followup'   },
    { index: 5, id: 'final_thoughts',  label: 'Final Thoughts', optional: true },
  ],

  // ── TYPE 3: Shayona Café ──────────────────────────────────────────────────
  // Indices are logical question positions in the full question array
  // (excluding section-header slides which auto-advance without analytics events).
  // Branch questions (grabGo*, foodRating*, catering*, browsing*) will show
  // naturally low reachPct — this is correct and meaningful funnel data.
  type3: [
    // Global
    { index: 0,  id: 'cafeExperience',      label: 'Overall Experience'      },
    { index: 1,  id: 'visitPurpose',        label: 'Purpose of Visit'        },
    { index: 2,  id: 'waitTime',            label: 'Wait Time'               },
    { index: 3,  id: 'waitAcceptable',      label: 'Wait Acceptable'         },
    { index: 4,  id: 'flowExperience',      label: 'Visit Flow'              },
    // Branch A: Grab & Go
    { index: 5,  id: 'grabGoFinding',       label: 'Finding Items (Grab & Go)' },
    { index: 6,  id: 'grabGoSpeed',         label: 'Speed (Grab & Go)'       },
    // Branch B: Hot Food / Buffet
    { index: 7,  id: 'foodPriority',        label: 'Food Priority'           },
    { index: 8,  id: 'foodRating',          label: 'Food Rating'             },
    // Branch C: Catering
    { index: 9,  id: 'cateringClarity',     label: 'Catering Clarity'        },
    { index: 10, id: 'cateringImprovement', label: 'Catering Improvement'    },
    // Branch D1: Failed Intent
    { index: 11, id: 'browsingBarrier',     label: 'Purchase Barrier'        },
    // Branch D2: Casual Browser
    { index: 12, id: 'browsingDiscovery',   label: 'Discovery Interest'      },
    // Final (all visitors)
    { index: 13, id: 'finalThoughts',       label: 'Final Thoughts', optional: true },
  ],

};

// ─── Auth ─────────────────────────────────────────────────────────────────────
function getAuthClient() {
  // FIX v1.2.0: was /\\\\n/g → '\\n' (over-escaped). Now matches submit-survey.js.
  const privateKey  = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

  if (!privateKey || !clientEmail) {
    throw new Error('Missing GOOGLE_PRIVATE_KEY or GOOGLE_SERVICE_ACCOUNT_EMAIL env vars');
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key:  privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

// ─── Sheet reader ─────────────────────────────────────────────────────────────
async function readAnalyticsDetail() {
  const auth   = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'Analytics_Detail!A2:K',  // skip header row
  });

  const rows = res.data.values || [];

  return rows.map(r => ({
    timestamp:         r[0]  || '',
    kioskId:           r[1]  || '',
    sessionId:         r[2]  || '',
    eventType:         r[3]  || '',
    surveyId:          r[4]  || '',
    questionId:        r[5]  || '',
    questionIndex:     r[6]  !== undefined ? Number(r[6]) : null,
    totalTimeSeconds:  r[7]  !== undefined ? Number(r[7]) : null,
    reason:            r[8]  || '',
    surveyType:        r[9]  || '',
    questionTimeSpent: r[10] !== undefined ? Number(r[10]) : null,
  }));
}

// ─── Funnel builder ───────────────────────────────────────────────────────────
function buildFunnel(rows, surveyType) {
  const defs = QUESTION_DEFS[surveyType];
  if (!defs) return null;

  const typeRows = rows.filter(r => r.surveyType === surveyType);

  const completedSessionIds = new Set(
    typeRows
      .filter(r => r.eventType === 'survey_completed')
      .map(r => r.sessionId)
  );

  const abandonRows = typeRows.filter(r => r.eventType === 'survey_abandoned');
  const abandonMap  = new Map();
  for (const row of abandonRows) {
    if (row.questionIndex === null) continue;
    const existing = abandonMap.get(row.sessionId);
    if (existing === undefined || row.questionIndex > existing) {
      abandonMap.set(row.sessionId, row.questionIndex);
    }
  }

  const totalStarted = completedSessionIds.size + abandonMap.size;

  if (totalStarted === 0) {
    return {
      surveyType,
      totalStarted:   0,
      totalCompleted: 0,
      completionRate: 0,
      questions: defs.map(q => ({
        index:           q.index,
        id:              q.id,
        label:           q.label,
        optional:        q.optional || false,
        sessionsReached: 0,
        reachPct:        0,
        dropOffCount:    0,
        dropOffPct:      0,
        avgTimeSeconds:  null,
      })),
    };
  }

  const questions = defs.map(q => {
    let sessionsReached = completedSessionIds.size;
    for (const [, abandonedAt] of abandonMap) {
      if (abandonedAt >= q.index) sessionsReached++;
    }

    let dropOffCount = 0;
    for (const [, abandonedAt] of abandonMap) {
      if (abandonedAt === q.index) dropOffCount++;
    }

    const timeSamples = typeRows
      .filter(r =>
        r.questionIndex === q.index &&
        r.questionTimeSpent !== null &&
        !isNaN(r.questionTimeSpent) &&
        r.questionTimeSpent > 0
      )
      .map(r => r.questionTimeSpent);

    const avgTimeSeconds = timeSamples.length > 0
      ? Math.round(timeSamples.reduce((a, b) => a + b, 0) / timeSamples.length)
      : null;

    return {
      index:           q.index,
      id:              q.id,
      label:           q.label,
      optional:        q.optional || false,
      sessionsReached,
      reachPct:        Math.round((sessionsReached / totalStarted) * 100),
      dropOffCount,
      dropOffPct:      sessionsReached > 0
                         ? Math.round((dropOffCount / sessionsReached) * 100)
                         : 0,
      avgTimeSeconds,
    };
  });

  return {
    surveyType,
    totalStarted,
    totalCompleted: completedSessionIds.size,
    completionRate: Math.round((completedSessionIds.size / totalStarted) * 100),
    questions,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rows        = await readAnalyticsDetail();
    const typeParam   = req.query.type;

    // FIX v1.2.0: derive allowed types from QUESTION_DEFS — no longer hardcoded
    const allowedTypes = Object.keys(QUESTION_DEFS);

    if (typeParam && !allowedTypes.includes(typeParam)) {
      return res.status(400).json({
        error: `Invalid type. Use one of: ${allowedTypes.join(', ')}.`
      });
    }

    // FIX v1.2.0: build all defined types on bare GET, not just type1 + type2
    const typesToBuild = typeParam ? [typeParam] : allowedTypes;
    const results      = {};

    for (const t of typesToBuild) {
      results[t] = buildFunnel(rows, t);
    }

    return typeParam
      ? res.status(200).json(results[typeParam])
      : res.status(200).json(results);

  } catch (err) {
    console.error('[analytics-summary] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch analytics data', detail: err.message });
  }
}
