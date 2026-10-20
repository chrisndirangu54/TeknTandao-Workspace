// Pure ISP state-transition helpers: no network or payment operations.
export const incidentTransitions = Object.freeze({
  open: ['acknowledged', 'resolved'],
  acknowledged: ['resolved'],
  resolved: [],
});
export const workOrderTransitions = Object.freeze({
  open: ['in_progress', 'completed'],
  in_progress: ['completed'],
  completed: [],
});
export function canChangeIncidentStatus(from, to) {
  return (incidentTransitions[from] || []).includes(to);
}
export function canChangeWorkOrderStatus(from, to) {
  return (workOrderTransitions[from] || []).includes(to);
}
export function canonicalSubscriberCode(value) {
  return String(value).trim().toUpperCase();
}
