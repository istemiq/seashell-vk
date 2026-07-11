import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPracticeExpert,
  isPracticeExpertId,
  listPracticeExpertsForUi,
  PRACTICE_EXPERT_START_MARKER,
} from '../practiceExperts.js';
import { loadPracticeExpertTurnPrompt } from '../promptLoader.js';

describe('practiceExperts', () => {
  it('recognizes valid expert ids', () => {
    assert.equal(isPracticeExpertId('philosopher'), true);
    assert.equal(isPracticeExpertId('psychologist'), true);
    assert.equal(isPracticeExpertId('nope'), false);
  });

  it('lists experts with locale-specific titles and categories', () => {
    const ruList = listPracticeExpertsForUi('ru');
    const enList = listPracticeExpertsForUi('en');
    assert.ok(ruList.length >= 25);
    const psychRu = ruList.find((e) => e.id === 'psychologist');
    assert.ok(psychRu?.title?.includes('Психолог'));
    assert.equal(psychRu?.category, 'health');
    assert.equal(ruList.find((e) => e.id === 'physicist')?.category, 'sciences');
    assert.equal(ruList.find((e) => e.id === 'muslim_tradition')?.category, 'faiths');
    const psychEn = enList.find((e) => e.id === 'psychologist');
    assert.equal(psychEn?.title, 'Psychology educator (theoretical chat only)');
    assert.ok(ruList.findIndex((e) => e.id === 'philosopher') < ruList.findIndex((e) => e.id === 'physicist'));
  });

  it('psychologist safeguards mention no therapy', () => {
    const expert = getPracticeExpert('psychologist');
    assert.match(expert.safeguards, /NOT a therapist/i);
  });

  it('religious traditions share respect and non-violence safeguards', () => {
    const muslim = getPracticeExpert('muslim_tradition');
    const christian = getPracticeExpert('christian_tradition');
    assert.match(muslim.safeguards, /NOT clergy/i);
    assert.match(muslim.safeguards, /No violence/i);
    assert.match(muslim.safeguards, /No misogyny/i);
    assert.ok(getPracticeExpert('buddhist_tradition'));
    assert.ok(getPracticeExpert('krishnaite_tradition'));
    assert.equal(christian.titleRu.includes('Христианин'), true);
  });

  it('loads expert prompt with role substitution', () => {
    const expert = getPracticeExpert('philosopher');
    const prompt = loadPracticeExpertTurnPrompt('ru', expert);
    assert.match(prompt, /Philosopher/);
    assert.match(prompt, /PHASE A/);
    assert.match(prompt, /PHASE C hard bans/i);
    assert.match(prompt, /\{\{ACTIVE_THREAD\}\}|Active thread/i);
    assert.ok(prompt.includes(PRACTICE_EXPERT_START_MARKER));
    assert.match(prompt, /Russian/);
  });
});
