// FILE: api/analytics-summary.js
// VERSION: 1.1.0
// PURPOSE: Reads Analytics_Detail sheet and returns funnel data per surveyType.
//
// GET /api/analytics-summary?type=type1   → type1 funnel
// GET /api/analytics-summary?type=type2   → type2 funnel
// GET /api/analytics-summary              → both types
//
// Funnel logic:
//   - "Sessions started" = unique sessions where questionIndex === 0 appears OR session completed
//   - Drop-off per question = sessions abandoned exactly at that index
//   - reachPct = (sessions that reached this index) / totalStarted * 100
//
// Column order in Analytics_Detail (0-indexed):
//   0  timestamp
//   1  kioskId
//   2  sessionId
//   3  eventType
//   4  surveyId
//   5  questionId
//   6  questionIndex
//   7  totalTimeSeconds
//   8  reason
//   9  surveyType
//   10 questionTimeSpent

import { google } from 'googleapis';

// ─── Question definitions (mirrors data-util.js) ──────────────────────────────
const QUESTION_DEFS = {
  type1: [
    { index: 0, id: 'satisfaction',      label: 'Overall Satisfaction' },
    { index: 1, id: 'cleanliness',       label: 'Cleanliness' },
    { index: 2, id: 'stafffriendliness', label: 'Staff Friendliness' },
    { index: 3, id: 'location',          label: 'Where Visiting From' },
    { index: 4, id: 'age',               label: 'Age Group' },
    { index: 5, id: 'hearabout',         label: 'How Did You Hear' },
    { index: 6, id: 'giftshopvisit',     label: 'Shayona Cafe Visit' },
    { index: 7, id: 'enjoyedmost',       label: 'Comments', optional: false },
  ],
  type2: [
    { index: 0, id: 'satisfaction',    label: 'Overall Satisfaction' },
    { index: 1, id: 'experiences',     label: 'What Did You Enjoy' },
    { index: 2, id: 'standout',        label: 'Best Describes Visit' },
    { index: 3, id: 'shayona_intent',  label: 'Shayona Cafe + Followup' },
    { index: 4, id: 'expectation_met', label: 'Visit Flow + Followup' },
    { index: 5, id: 'final_thoughts',  label: 'Final Thoughts', optional: true },
  ],
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
// Uses split-key env vars: GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
// GOOGLE_PRIVATE_KEY must have literal \n replaced with real newlines (handled below)
function getAuthClient() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
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

  // Completed session IDs
  const completedSessionIds = new Set(
    typeRows
      .filter(r => r.eventType === 'survey_completed')
      .map(r => r.sessionId)
  );

  // Abandon rows only — one per session (take highest index if duplicates)
  const abandonRows = typeRows.filter(r => r.eventType === 'survey_abandoned');
  const abandonMap  = new Map(); // sessionId → questionIndex abandoned at
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
    // Sessions that reached this question:
    //   all completed sessions + abandoned sessions that got to index >= this one
    let sessionsReached = completedSessionIds.size;
    for (const [, abandonedAt] of abandonMap) {
      if (abandonedAt >= q.index) sessionsReached++;
    }

    // Drop-off AT this question = abandoned exactly here
    let dropOffCount = 0;
    for (const [, abandonedAt] of abandonMap) {
      if (abandonedAt === q.index) dropOffCount++;
    }

    // Average time spent on this question
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
    const rows      = await readAnalyticsDetail();
    const typeParam = req.query.type; // 'type1' | 'type2' | undefined

    if (typeParam && typeParam !== 'type1' && typeParam !== 'type2') {
      return res.status(400).json({ error: 'Invalid type. Use type1 or type2.' });
    }

    const typesToBuild = typeParam ? [typeParam] : ['type1', 'type2'];
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
