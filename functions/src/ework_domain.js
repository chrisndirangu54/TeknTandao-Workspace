import {identifier, textValue, optionalText} from './domain.js';

const skillsOf = value => new Set(String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean));

export function overdueTaskGap(task, now) {
  if (!task || !['open', 'in_progress'].includes(task.status) || !task.dueAt || Date.parse(task.dueAt) >= now) return null;
  return {kind: 'gap', name: textValue(task.name), sourceApp: 'crm', sourceId: identifier(task.id), status: 'detected', notes: 'Overdue task'};
}

export function reviewGap(gap, decision) {
  if (!gap || gap.kind !== 'gap' || gap.status !== 'detected') throw new Error('Only a detected gap can be reviewed');
  if (!['reviewed', 'dismissed'].includes(decision)) throw new Error('Invalid gap decision');
  return {status: decision};
}

export function buildBrief(input) {
  return {kind: 'brief', name: textValue(input.name), gapId: identifier(input.gapId), skills: textValue(input.skills, 400),
    summary: optionalText(input.summary ?? '', 4000), status: 'proposed'};
}

export function approveBrief(gap, brief) {
  if (!gap || gap.status !== 'reviewed' || !brief || brief.kind !== 'brief' || brief.status !== 'proposed' || brief.gapId !== gap.id) {
    throw new Error('Approve a proposed brief for a reviewed gap');
  }
  return {status: 'approved'};
}

export function proposeMatches(brief, freelancers) {
  if (!brief || brief.status !== 'approved') throw new Error('Match an approved brief');
  const required = skillsOf(brief.skills);
  return freelancers.filter(person => person && person.optedIn === true && person.availability !== 'unavailable').map(person => {
    const overlap = [...required].filter(skill => skillsOf(person.skills).has(skill));
    return {freelancerId: identifier(person.id), name: textValue(person.name), score: overlap.length,
      reason: overlap.length ? `Skills: ${overlap.join(', ')}` : 'No overlapping skills listed'};
  }).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
}

export function approveMatch(match) {
  if (!match || match.kind !== 'match' || match.status !== 'proposed') throw new Error('Only a proposed match can be approved');
  return {status: 'approved'};
}

export function buildMilestone(input) {
  const dueAt = textValue(input.dueAt, 80);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(dueAt) || !Number.isFinite(Date.parse(dueAt))) throw new Error('Due time requires an ISO date and timezone');
  return {kind: 'milestone', name: textValue(input.name), engagementId: identifier(input.engagementId), dueAt: new Date(dueAt).toISOString(), status: 'open'};
}

export function submitMilestone(milestone) {
  if (!milestone || milestone.kind !== 'milestone' || milestone.status !== 'open') throw new Error('Only an open milestone can be submitted');
  return {status: 'submitted'};
}

export function acceptMilestone(milestone) {
  if (!milestone || milestone.status !== 'submitted') throw new Error('Only a submitted milestone can be accepted');
  return {status: 'accepted'};
}

export function acceptanceProgress(engagement, acceptedNow) {
  const milestoneCount = engagement?.milestoneCount || 0;
  const acceptedCount = (engagement?.acceptedCount || 0) + (acceptedNow ? 1 : 0);
  if (milestoneCount < 1 || acceptedCount > milestoneCount) throw new Error('Milestone count is inconsistent');
  return {acceptedCount, status: acceptedCount === milestoneCount ? 'completed' : 'in_progress'};
}
