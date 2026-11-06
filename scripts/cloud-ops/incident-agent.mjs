import {assessCloudSignals} from '../../functions/src/cloud_planning_domain.js';
// Bounded incident planner. No untrusted telemetry is used to formulate shell commands.
export function makeIncidentRunbook({appName,signals=[]}){
 if(typeof appName!=='string'||appName.length<1||appName.length>120)throw Error('Invalid application');
 const assessment=assessCloudSignals(signals);
 const incidents=assessment.filter(s=>s.severity==='review');
 return {appName,mode:'advisory',incidents,
   nextSteps:incidents.length?[
    'Verify source metric accuracy and check Azure Service Health',
    'Inspect recent deployments, container revisions, and application logs',
    'Request explicit customer approval before applying a documented recovery action',
    'Record the result and compare telemetry against the original alert'
   ]:['No threshold breaches were found in the supplied sample.'],
   remoteCommandsExecuted:0,customerApprovalRequired:true};
}
