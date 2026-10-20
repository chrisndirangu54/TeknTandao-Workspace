// Pure, auditable ISP record schemas shared by callable APIs.
// Financial status and network change execution are intentionally unavailable.
const txt = (label,required=true,max=120) => ({label,type:'text',required,max});
const n = (label,required=true,min=0,max=1e7) => ({label,type:'number',required,min,max});
const opts = (label,values,required=true) => ({label,type:'select',required,values});
const note = (label,required=false) => ({label,type:'longtext',required,max:1500});
const flow=(initial,transitions={})=>({initial,transitions});
export const ispSchema = Object.freeze({
 sites:{title:'Sites & coverage',description:'PoPs, estates, buildings, cabinets, splitter and service zones.',collection:'ispSites',
  fields:{name:txt('Name'),type:opts('Site type',['pop','estate','building','cabinet','tower','splitter']),area:txt('Area'),latitude:n('Latitude',false,-90,90),longitude:n('Longitude',false,-180,180),notes:note('Site survey notes')},
  workflow:flow('planned',{planned:['surveyed'],surveyed:['approved','planned'],approved:['installed'],installed:['retired']})},
 devices:{title:'Managed equipment',description:'Model, revision, firmware, PoE and monitoring interfaces.',collection:'ispDevices',
  fields:{label:txt('Asset label'),vendor:txt('Vendor'),model:txt('Model'),role:opts('Network role',['core','fiber','wireless','other']),site:txt('Site'),serial:txt('Serial (optional)',false),hardwareRevision:txt('Hardware revision',false),firmware:txt('Firmware version',false),management:opts('Management',['unknown','snmp','api','ssh','tr069','omci','controller','multiple'],false),poe:opts('PoE input',['unknown','none','passive_24v','802.3af','802.3at','802.3bt'],false),portMbps:n('Wired port Mbps',false,1,100000),notes:note('Supplier and support notes')},
  workflow:flow('planned',{planned:['testing','installed'],testing:['validated','planned'],validated:['installed'],installed:['maintenance','retired'],maintenance:['installed','retired']})},
 links:{title:'Fiber & wireless links',description:'GPON paths, PON identifiers, wireless bridges and isolation.',collection:'ispLinks',
  fields:{label:txt('Link name'),site:txt('Site'),from:txt('Source'),to:txt('Destination'),medium:opts('Medium',['gpon','fiber','ptp_wireless','ethernet']),segmentId:txt('PON / shared segment'),capacityMbps:n('Design capacity Mbps',true,1,100000),distanceM:n('Path length m',false,0,300000),vlan:txt('VLAN or isolation profile',false),notes:note('Optical budget / RF LOS / PoE notes')},
  workflow:flow('planned',{planned:['surveyed'],surveyed:['tested','planned'],tested:['approved'],approved:['installed'],installed:['maintenance','retired'],maintenance:['installed','retired']})},
 subscribers:{title:'Subscribers',description:'Planned residential subscriptions (not automatically activated).',collection:'ispSubscribers',
  fields:{accountCode:txt('Account code'),site:txt('Site'),accessType:opts('Access',['fiber','wireless']),planMbps:n('Plan speed Mbps',true,1,10000),planCode:txt('Package code',false),deviceId:txt('Assigned device ID',false),notes:note('Installation and consent notes')},
  workflow:flow('planned',{planned:['installation_scheduled'],installation_scheduled:['installed_unprovisioned','planned'],installed_unprovisioned:['review_required'],review_required:['installed_unprovisioned']})},
 plans:{title:'Service packages',description:'Package prices, speed and fair-use disclosure.',collection:'ispPlans',
  fields:{code:txt('Unique package code'),name:txt('Package name'),speedMbps:n('Speed Mbps',true,1,10000),monthlyKes:n('Monthly KSh'),fairUsePolicy:note('Fair-use terms'),notes:note('Renewal and service notes')},
  workflow:flow('draft',{draft:['ready'],ready:['archived'],archived:[]})},
 telemetry:{title:'Network diagnostics',description:'Manual verified measurements only; live collectors not connected.',collection:'ispTelemetry',
  fields:{deviceId:txt('Registered device ID'),site:txt('Site'),segmentId:txt('Segment / PON',false),latencyMs:n('Latency ms',true,0,60000),jitterMs:n('Jitter ms',true,0,60000),packetLossPct:n('Packet loss %',true,0,100),utilizationPct:n('Utilization %',true,0,100),rxOpticalDbm:n('Optical receive dBm',false,-45,10),wirelessRssiDbm:n('RSSI dBm',false,-120,0),notes:note('Measurement method')},workflow:null},
 incidents:{title:'Outage incidents',description:'Audited incident response and human-reviewed resolution.',collection:'ispIncidents',
  fields:{title:txt('Incident title'),site:txt('Site'),segmentId:txt('Segment / PON',false),severity:opts('Severity',['low','medium','high','critical']),description:note('Observed symptoms')},
  workflow:flow('open',{open:['acknowledged','resolved'],acknowledged:['resolved'],resolved:[]})},
 workOrders:{title:'Technician work orders',description:'Technician assignments and verified field completion.',collection:'ispWorkOrders',
  fields:{title:txt('Title'),site:txt('Site'),priority:opts('Priority',['low','normal','urgent']),assignedTo:txt('Technician ID',false),description:note('Work and sign-off notes')},
  workflow:flow('open',{open:['in_progress','completed'],in_progress:['completed'],completed:[]})},
 support:{title:'Customer support',description:'Human-reviewed ticket triage; no auto WhatsApp sending.',collection:'ispSupportTickets',
  fields:{subscriberId:txt('Subscriber account code'),site:txt('Site'),channel:opts('Channel',['phone','email','whatsapp','walk_in','portal']),message:note('Customer message',true),notes:note('Escalation and resolution')},
  workflow:flow('open',{open:['triaged','resolved'],triaged:['resolved'],resolved:[]})},
 invoices:{title:'Invoice drafts',description:'Draft accounting; never indicates settled M-Pesa payments.',collection:'ispInvoices',
  fields:{invoiceCode:txt('Unique invoice ID'),subscriberId:txt('Subscriber code'),description:txt('Invoice description'),amountKes:n('Amount KSh',true,1,1e7),dueDate:txt('Due date YYYY-MM-DD',false),notes:note('Accounting notes')},
  workflow:flow('draft',{draft:['issued','void'],issued:['void'],void:[]})},
 payments:{title:'Payment reviews',description:'Unverified payment references; ledger integration pending.',collection:'ispPaymentReviews',
  fields:{invoiceCode:txt('Invoice code'),subscriberId:txt('Subscriber code'),provider:opts('Provider',['mpesa','paystack','bank','manual']),reference:txt('External reference'),amountKes:n('Claimed KSh',true,1,1e7),notes:note('Evidence')},
  workflow:flow('unverified',{unverified:['under_review','rejected'],under_review:['rejected'],rejected:[]})},
 provisioning:{title:'Provisioning approvals',description:'Approval requests only; NO live RADIUS/ACS/router changes.',collection:'ispProvisioningRequests',
  fields:{subscriberId:txt('Subscriber code'),deviceId:txt('Device ID'),adapter:opts('Target',['routeros','radius','omci','genieacs']),operation:opts('Operation',['activate','suspend','change_plan','deactivate','update_wifi']),justification:note('Justification',true)},
  workflow:flow('requested',{requested:['approved_for_manual_review','cancelled'],approved_for_manual_review:['cancelled'],cancelled:[]})},
 firmware:{title:'Firmware maintenance',description:'Revision compatibility, signed images and recovery plans.',collection:'ispFirmwareRequests',
  fields:{deviceId:txt('Device ID'),currentVersion:txt('Current version'),targetVersion:txt('Target version'),maintenanceWindow:txt('Maintenance window'),rollbackPlan:note('Rollback and recovery plan',true),notes:note('Signature/checksum evidence')},
  workflow:flow('requested',{requested:['approved_for_manual_review','cancelled'],approved_for_manual_review:['cancelled'],cancelled:[]})},
 notifications:{title:'Message drafts',description:'Customer-consented message drafts, not delivered notifications.',collection:'ispNotificationDrafts',
  fields:{title:txt('Notice title'),audience:opts('Audience',['all','fiber','wireless','affected_segment','individual']),channel:opts('Channel',['whatsapp','sms','email','in_app']),message:note('Message text',true),notes:note('Consent/template')},
  workflow:flow('draft',{draft:['reviewed','archived'],reviewed:['archived'],archived:[]})},
 procurement:{title:'Supplier & compliance',description:'ONT/CPE hardware and local type approval checklist.',collection:'ispProcurement',
  fields:{vendor:txt('Vendor'),model:txt('Model'),type:opts('Equipment type',['ont','cpe','router','ap','bridge','olt','switch','ups']),unitKes:n('Unit KSh'),quantity:n('Quantity',true,1,10000),management:opts('Management',['snmp','api','ssh','tr069','omci','controller','unverified']),gigabit:opts('Ports',['gigabit','fast_ethernet','multi_gigabit','unknown']),approval:opts('CA approval',['unverified','approved','rejected']),notes:note('Firmware, PoE, MIBs and warranty')},
  workflow:flow('research',{research:['shortlisted'],shortlisted:['tested','rejected'],tested:['accepted','rejected'],accepted:[],rejected:[]})},
 policies:{title:'Security, VLAN & QoS',description:'Firewall, bandwidth and isolation proposals; no commands run.',collection:'ispPolicyRequests',
  fields:{title:txt('Policy title'),scope:opts('Scope',['vlan_isolation','radius','captive_portal','qos','firewall','poe','backup','security']),site:txt('Site'),vlanId:n('VLAN ID',false,1,4094),description:note('Proposed change',true),rollbackPlan:note('Recovery plan')},
  workflow:flow('draft',{draft:['reviewed','cancelled'],reviewed:['approved_for_manual_review','cancelled'],approved_for_manual_review:['cancelled'],cancelled:[]})},
 outreach:{title:'Coverage opportunities',description:'Estate expansion, feasibility and potential customers.',collection:'ispOpportunities',
  fields:{site:txt('Estate / site'),area:txt('Neighborhood'),estimatedHomes:n('Potential homes',true,1,100000),estimatedTakeUpPct:n('Estimated take-up %',true,0,100),approach:opts('Access',['ftth','wireless_backhaul','mixed','resale']),notes:note('Permissions, survey and costs')},
  workflow:flow('identified',{identified:['surveying','rejected'],surveying:['proposal','rejected'],proposal:['approved','rejected'],approved:[],rejected:[]})}
});
export const ispIntegrationStatus = Object.freeze([
 {id:'mikrotik',name:'MikroTik RouterOS',status:'not_connected'},
 {id:'vsol',name:'VSOL GPON / OMCI',status:'not_connected'},
 {id:'comfast',name:'COMFAST hardware management',status:'not_verified'},
 {id:'genieacs',name:'GenieACS TR-069 / USP',status:'not_connected'},
 {id:'radius',name:'FreeRADIUS subscriber AAA',status:'not_connected'},
 {id:'daraja',name:'Safaricom Daraja M-Pesa',status:'not_connected'},
 {id:'whatsapp',name:'WhatsApp Business',status:'not_connected'},
 {id:'monitoring',name:'SNMP / Zabbix / Prometheus',status:'not_connected'},
 {id:'ai',name:'Predictive AI models',status:'not_trained'}
]);
export function normalizeIspRecord(moduleName, record) {
 const def=ispSchema[moduleName];
 if(!Object.hasOwn(ispSchema,moduleName))throw new Error('Unknown ISP module');
 if(!record||typeof record!=='object'||Array.isArray(record)||Object.keys(record).some(k=>!Object.hasOwn(def.fields,k)))throw new Error('Unexpected record fields');
 const result={};
 for(const [key,spec] of Object.entries(def.fields)){
  const input=record[key];
  if(input===undefined||input===null||input===''){
    if(spec.required)throw new Error('Missing '+key);
    continue;
  }
  if(spec.type==='number'){
    if(typeof input!=='number'||!Number.isFinite(input)||input<spec.min||input>spec.max)throw new Error('Invalid '+key);
    result[key]=input;
  }else if(spec.type==='select'){
    if(!spec.values.includes(input))throw new Error('Invalid '+key);
    result[key]=input;
  }else{
    if(typeof input!=='string'||!input.trim()||input.trim().length>spec.max)throw new Error('Invalid '+key);
    result[key]=input.trim();
  }
 }
 if(moduleName==='subscribers'){
  result.accountCode=result.accountCode.toUpperCase();
  if(!/^[A-Z0-9_-]{2,64}$/.test(result.accountCode))throw new Error('Invalid subscriber code');
 }
 if(moduleName==='plans'&&!/^[A-Za-z0-9_-]{2,64}$/.test(result.code))throw new Error('Invalid plan code');
 if(moduleName==='invoices'&&!/^[A-Za-z0-9_-]{2,64}$/.test(result.invoiceCode))throw new Error('Invalid invoice code');
 if(moduleName==='payments'&&!/^[A-Za-z0-9_-]{3,120}$/.test(result.reference))throw new Error('Invalid payment reference');
 if(moduleName==='sites'&&(Object.hasOwn(result,'latitude')!==Object.hasOwn(result,'longitude')))throw new Error('Latitude and longitude must be supplied together');
 if(moduleName==='telemetry')result.source='manual_admin';
 return result;
}
export function allowedIspTransition(moduleName,from,to){
 const flow=ispSchema[moduleName]?.workflow;
 return !!flow&&(flow.transitions[from]||[]).includes(to);
}
export function ispRecordId(moduleName,record,uuid){
 if(moduleName==='subscribers')return record.accountCode;
 if(moduleName==='plans')return record.code.toUpperCase();
 if(moduleName==='invoices')return record.invoiceCode.toUpperCase();
 if(moduleName==='payments')return (record.provider+'_'+record.reference).toUpperCase();
 return uuid;
}
export function ispLinkHealth(record){
 const {latencyMs,jitterMs,packetLossPct,utilizationPct}=record;
 if(![latencyMs,jitterMs,packetLossPct,utilizationPct].every(Number.isFinite))return 'insufficient_data';
 if(packetLossPct>=5||(latencyMs>=150&&jitterMs>=45))return 'critical';
 if(packetLossPct>=1||latencyMs>=100||jitterMs>=30||utilizationPct>=85)return 'warning';
 return 'healthy';
}
