// Pure state transition guards for ISP operator workflows.
// External router, RADIUS, ACS and M-Pesa mutations are intentionally NOT implemented.
export function canAdvanceIncident(from,to){
  return (from==='open' && (to==='acknowledged'||to==='resolved')) || (from==='acknowledged' && to==='resolved');
}
export function canAdvanceWorkOrder(from,to){
  return (from==='open' && (to==='in_progress'||to==='closed')) || (from==='in_progress' && to==='closed');
}
