import test from 'node:test';
import assert from 'node:assert/strict';
import {overdueTaskGap, reviewGap, approveBrief, proposeMatches, approveMatch, acceptMilestone, acceptanceProgress} from '../src/ework_domain.js';

test('ework detects overdue tasks, ranks opted-in freelancers, and accepts only submitted work', () => {
  const now = Date.parse('2026-09-22T12:00:00Z');
  assert.equal(overdueTaskGap({id: 't1', name: 'Follow up', status: 'open', dueAt: '2026-09-21T10:00:00Z'}, now).status, 'detected');
  assert.equal(overdueTaskGap({id: 't1', name: 'Follow up', status: 'completed', dueAt: '2026-09-21T10:00:00Z'}, now), null);
  const gap = {id: 'g1', kind: 'gap', status: 'reviewed'};
  const brief = {kind: 'brief', status: 'proposed', gapId: 'g1', skills: 'Flutter, Firebase'};
  assert.equal(approveBrief(gap, brief).status, 'approved');
  const ranked = proposeMatches({status: 'approved', skills: 'Flutter, Payroll'}, [
    {id: 'freelancer_a', name: 'Amina', skills: 'Payroll, Books', optedIn: true, availability: 'available'},
    {id: 'freelancer_b', name: 'Brian', skills: 'Design', optedIn: true, availability: 'available'},
    {id: 'freelancer_c', name: 'Chipo', skills: 'Flutter', optedIn: false, availability: 'available'},
  ]);
  assert.equal(ranked[0].freelancerId, 'freelancer_a');
  assert.match(ranked[0].reason, /payroll/);
  assert.equal(ranked.find(match => match.freelancerId === 'freelancer_c'), undefined);
  assert.equal(approveMatch({kind: 'match', status: 'proposed'}).status, 'approved');
  assert.throws(() => acceptMilestone({kind: 'milestone', status: 'open'}), /submitted/);
  assert.equal(acceptMilestone({kind: 'milestone', status: 'submitted'}).status, 'accepted');
  assert.equal(acceptanceProgress({milestoneCount: 2, acceptedCount: 0}, true).status, 'in_progress');
  assert.equal(acceptanceProgress({milestoneCount: 1, acceptedCount: 0}, true).status, 'completed');
  assert.equal(reviewGap({kind: 'gap', status: 'detected'}, 'dismissed').status, 'dismissed');
});
