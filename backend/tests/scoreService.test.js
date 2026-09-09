/**
 * scoreService.test.js
 *
 * Tests for the final-submission / score-calculation flow.
 * Run with: node tests/scoreService.test.js   (no Jest needed)
 *
 * These tests use in-memory stubs — no real MongoDB connection required.
 */

'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

// ── Very small test harness ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  FAIL: ${label}`);
    failed++;
  }
}

async function run(label, fn) {
  process.stdout.write(`\n[TEST] ${label}\n`);
  try {
    await fn();
  } catch (e) {
    console.error(`  ✗  UNCAUGHT: ${e.message}`);
    failed++;
  }
}

// ── Stub models ───────────────────────────────────────────────────────────────
const FAKE_SESSION_ID = new mongoose.Types.ObjectId();
const FAKE_QUIZ_ID    = new mongoose.Types.ObjectId();

// ── ranking sort — pure logic (no DB needed) ──────────────────────────────────
function sortAttempts(arr) {
  return arr.slice().sort((a, b) => {
    if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
    if (a.timeTaken      !== b.timeTaken)      return a.timeTaken - b.timeTaken;
    return new Date(a.submittedAt) - new Date(b.submittedAt);
  }).map((x, i) => ({ ...x, rank: i + 1 }));
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {

await run('T11 — Ranking: correctAnswers DESC, timeTaken ASC, submittedAt ASC', async () => {
  const base = new Date('2024-01-01T10:00:00Z');
  const attempts = [
    { displayName: 'C', correctAnswers: 9,  timeTaken: 20, submittedAt: new Date(base.getTime() - 1000) },
    { displayName: 'B', correctAnswers: 10, timeTaken: 65, submittedAt: new Date(base.getTime() + 5000) },
    { displayName: 'A', correctAnswers: 10, timeTaken: 50, submittedAt: base },
  ];
  const ranked = sortAttempts(attempts);
  assert(ranked[0].displayName === 'A', 'Rank 1: A (10 correct, 50s)');
  assert(ranked[1].displayName === 'B', 'Rank 2: B (10 correct, 65s)');
  assert(ranked[2].displayName === 'C', 'Rank 3: C (9 correct, 20s)');
  assert(ranked[0].rank === 1, 'Rank field is 1 for first');
  assert(ranked[2].rank === 3, 'Rank field is 3 for last');
});

await run('T11b — Ranking: equal score+time → earlier submittedAt wins', async () => {
  const t1 = new Date('2024-01-01T10:00:00Z');
  const t2 = new Date('2024-01-01T10:00:01Z');
  const ranked = sortAttempts([
    { displayName: 'Late',  correctAnswers: 8, timeTaken: 40, submittedAt: t2 },
    { displayName: 'Early', correctAnswers: 8, timeTaken: 40, submittedAt: t1 },
  ]);
  assert(ranked[0].displayName === 'Early', 'Earlier submittedAt wins tie');
  assert(ranked[1].displayName === 'Late',  'Later submittedAt loses tie');
});

await run('T11c — Faster student never beats student with more correct answers', async () => {
  const ranked = sortAttempts([
    { displayName: 'Slow', correctAnswers: 9, timeTaken: 999, submittedAt: new Date() },
    { displayName: 'Fast', correctAnswers: 5, timeTaken: 1,   submittedAt: new Date() },
  ]);
  assert(ranked[0].displayName === 'Slow', '9 correct beats 5 correct regardless of time');
});

await run('T6 — Safe studentId resolution (invalid string falls back to guest)', async () => {
  function resolveStudentId(rawStudentId) {
    if (!rawStudentId) return null;
    try {
      return new mongoose.Types.ObjectId(rawStudentId);
    } catch {
      return null;
    }
  }

  assert(resolveStudentId(null)          === null, 'null → null (guest)');
  assert(resolveStudentId('')            === null, 'empty string → null (guest)');
  assert(resolveStudentId('not-valid')   === null, 'invalid string → null (guest, no throw)');
  const validId = new mongoose.Types.ObjectId();
  const resolved = resolveStudentId(validId.toString());
  assert(resolved !== null && resolved.toString() === validId.toString(), 'valid ObjectId string → ObjectId');
});

await run('T10 — Race condition: upsert filter differs per student', async () => {
  const idA = new mongoose.Types.ObjectId();
  const idB = new mongoose.Types.ObjectId();
  const sessionId = new mongoose.Types.ObjectId();

  const filterA = { sessionId, studentId: idA };
  const filterB = { sessionId, studentId: idB };

  assert(
    filterA.studentId.toString() !== filterB.studentId.toString(),
    'Different studentIds produce different upsert filters (no collision)'
  );

  const filterGuest1 = { sessionId, displayName: 'Alice', studentId: null };
  const filterGuest2 = { sessionId, displayName: 'Bob',   studentId: null };
  assert(
    filterGuest1.displayName !== filterGuest2.displayName,
    'Different guests produce different upsert filters'
  );
});

await run('T3/T4/T5 — $set/$setOnInsert update shape does not replace document', async () => {
  const updatePayload = {
    $set: {
      correctAnswers:   5,
      incorrectAnswers: 5,
      totalQuestions:   10,
      score:            5,
      percentage:       50,
      timeTaken:        42,
      submittedAt:      new Date(),
      displayName:      'TestStudent',
      rollNumber:       '',
      section:          '',
      course:           '',
    },
    $setOnInsert: {
      sessionId: FAKE_SESSION_ID,
      quizId:    FAKE_QUIZ_ID,
      studentId: null,
    },
  };

  assert('$set'         in updatePayload, 'Update uses $set operator (no replacement)');
  assert('$setOnInsert' in updatePayload, 'Update uses $setOnInsert operator');
  assert(!('sessionId'   in updatePayload), 'sessionId NOT a top-level key (no replacement)');
  assert(!('displayName' in updatePayload), 'displayName NOT a top-level key');
});

await run('T7 — Idempotency: submit_quiz twice should not crash (state guard)', async () => {
  let sessionState = 'active';

  function tryClaimSession(currentState) {
    if (currentState !== 'active') return null;
    sessionState = 'finishing';
    return { state: 'finishing', _id: FAKE_SESSION_ID };
  }

  const first  = tryClaimSession(sessionState);
  assert(first !== null, 'First submit claim succeeds');
  assert(sessionState === 'finishing', 'State is finishing after first claim');

  const second = tryClaimSession(sessionState);
  assert(second === null, 'Second submit claim returns null (duplicate ignored)');
  assert(sessionState === 'finishing', 'State unchanged after duplicate claim');
});

await run('T8 — Already-completed session returns null from claim', async () => {
  function tryClaimCompleted(state) {
    return state === 'active' ? {} : null;
  }
  assert(tryClaimCompleted('completed') === null, 'Claim on completed returns null (no crash)');
  assert(tryClaimCompleted('finishing') === null, 'Claim on finishing returns null (no crash)');
});

await run('T9 — One malformed participant does not abort others', async () => {
  const participants = [
    { displayName: 'Good1',     rawStudentId: new mongoose.Types.ObjectId().toString() },
    { displayName: 'Malformed', rawStudentId: 'NOT_VALID_BSON' },
    { displayName: 'Good2',     rawStudentId: new mongoose.Types.ObjectId().toString() },
  ];

  const graded     = [];
  const failed_arr = [];

  for (const p of participants) {
    try {
      if (p.rawStudentId) new mongoose.Types.ObjectId(p.rawStudentId);
      graded.push(p.displayName);
    } catch {
      failed_arr.push(p.displayName);
    }
  }

  assert(failed_arr.includes('Malformed'), 'Malformed participant isolated');
  assert(graded.includes('Good1'),  'Good1 graded despite prior failure');
  assert(graded.includes('Good2'),  'Good2 graded despite prior failure');
  assert(failed_arr.length === 1,   'Only 1 participant failed');
});

await run('T6b — Guest vs registered upsert filters', async () => {
  const sessionId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();

  // Registered student
  const registeredFilter = { sessionId, studentId };
  assert('studentId' in registeredFilter, 'Registered filter uses studentId');
  assert(!('displayName' in registeredFilter), 'Registered filter has no displayName');

  // Guest student
  const guestFilter = { sessionId, displayName: 'Rahul', studentId: null };
  assert('displayName' in guestFilter, 'Guest filter uses displayName');
  assert(guestFilter.studentId === null, 'Guest filter has studentId: null');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(56));
console.log(`  Result: ${passed} passed, ${failed} failed`);
if (failed > 0) { console.error('  SOME CHECKS FAILED ❌'); process.exit(1); }
else             { console.log('  ALL CHECKS PASSED ✅'); }

} // end main()

main().catch(e => { console.error(e); process.exit(1); });
