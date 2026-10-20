/* The client never authorizes an action. Every read/write is checked again by a Firebase callable. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {user:null,orgId:null,busy:false};
  const show = (id,visible) => $(id).classList.toggle('hidden',!visible);
  const value = id => $(id).value.trim();
  const feedback = (message,error=false) => { const box=$('feedback'); box.textContent=message; box.classList.toggle('error',error); };
  const withBusy = async callback => {
    if (state.busy) return;
    state.busy=true;
    document.querySelectorAll('button').forEach(b=>b.disabled=true);
    try {await callback();} catch (e) {feedback(e?.message || String(e),true);}
    finally {state.busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
  };
  const fn = (name,data) => firebase.functions('europe-west1').httpsCallable(name)(data).then(r=>r.data);
  const inputOrg = () => {
    const orgId=value('orgId');
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(orgId)) throw new Error('Enter a valid workspace ID.');
    return orgId;
  };
  const confirmAction = message => window.confirm(message);
  const textNode = (tag,text,cls) => {
    const item=document.createElement(tag);
    item.textContent=String(text ?? '');
    if(cls) item.className=cls;
    return item;
  };
  const btn=(label,handler)=>{
    const b=textNode('button',label,'btn');b.type='button';
    b.addEventListener('click',()=>withBusy(handler));return b;
  };
  const date = v => { const d=new Date(v||'');return Number.isNaN(d.getTime())?'—':d.toLocaleString(); };
  function recordRow(record,category) {
    const box=document.createElement('article'); box.className='record';
    const left=document.createElement('div');
    left.append(textNode('h3',record.title||record.accountReference||'Untitled'));
    const summary=category==='incident'?[record.segment,record.severity,record.status].join(' · '):
      category==='order'?[record.assignedTo,record.priority,record.status].join(' · '):
      [record.serviceType,String(record.packageMbps)+' Mbps',record.status].join(' · ');
    left.append(textNode('p',summary,'muted'));
    if (record.description) left.append(textNode('p',record.description));
    if (record.notes) left.append(textNode('p',record.notes,'muted'));
    left.append(textNode('small','Created '+date(record.createdAt)));
    const actions=document.createElement('div'); actions.className='actions';
    if(category==='incident' && record.status==='open') actions.append(btn('Acknowledge',async()=>{
      await fn('updateIspIncidentStatus',{orgId:state.orgId,id:record.id,status:'acknowledged'});
      await refresh('Incident acknowledged.');
    }));
    if(category==='incident' && record.status!=='resolved') actions.append(btn('Resolve',async()=>{
      if(!confirmAction('Mark this incident resolved? This is an operator record, not a network restoration command.'))return;
      await fn('updateIspIncidentStatus',{orgId:state.orgId,id:record.id,status:'resolved'});
      await refresh('Incident marked resolved.');
    }));
    if(category==='order' && record.status==='open') actions.append(btn('Start work',async()=>{
      await fn('updateIspWorkOrderStatus',{orgId:state.orgId,id:record.id,status:'in_progress'});
      await refresh('Work order in progress.');
    }));
    if(category==='order' && record.status!=='closed') actions.append(btn('Close order',async()=>{
      if(!confirmAction('Close this work order?'))return;
      await fn('updateIspWorkOrderStatus',{orgId:state.orgId,id:record.id,status:'closed'});
      await refresh('Work order closed.');
    }));
    box.append(left,actions);return box;
  }
  function render(list,id,category) {
    const container=$(id);container.replaceChildren();
    if(!list.length){container.append(textNode('p','No '+category+' records yet.','empty'));return;}
    list.forEach(item=>container.append(recordRow(item,category)));
  }
  async function refresh(message) {
    const response=await fn('getIspAdminOverview',{orgId:state.orgId});
    $('orgName').textContent=(response.orgName||response.orgId)+' · ISP operations';
    $('incidentCount').textContent=response.incidents.filter(i=>i.status!=='resolved').length;
    $('orderCount').textContent=response.workOrders.filter(o=>o.status!=='closed').length;
    $('queueCount').textContent=response.provisioningRequests.filter(p=>p.status==='pending_manual_review').length;
    render(response.incidents,'incidents','incident');
    render(response.workOrders,'orders','order');
    render(response.provisioningRequests,'provisions','provision');
    const option=$('orderIncident');option.replaceChildren(new Option('No incident',''));
    response.incidents.filter(i=>i.status!=='resolved').forEach(i=>option.add(new Option(i.title,i.id)));
    show('dashboard',true);
    feedback(message||'Owner authorization verified. Manual ISP workflows are ready; no live network integrations enabled.');
  }
  async function openWorkspace() {
    const next=inputOrg();
    state.orgId=next;
    show('dashboard',false);
    await refresh();
  }
  async function onSignedIn(user) {
    state.user=user;
    show('authSection',false);
    show('logout',true);
    show('workspaceSection',true);
    $('orgId').value=user.uid; // existing createOrganization uses the owner UID
    try {
      const profile=await firebase.firestore().doc('users/'+user.uid).get();
      const orgId=profile.data()?.orgId;
      if(orgId && /^[A-Za-z0-9_-]{1,128}$/.test(orgId)) $('orgId').value=orgId;
    }catch (_) { /* optional profile lookup; owner can enter workspace ID */ }
    await withBusy(openWorkspace);
  }
  async function onSignedOut() {
    state.user=null;state.orgId=null;
    show('logout',false);show('authSection',true);show('workspaceSection',false);show('dashboard',false);
    feedback('Sign in with your TeknTandao workspace account.');
  }
  $('loginForm').addEventListener('submit',event=>{
    event.preventDefault();
    withBusy(async()=>{await firebase.auth().signInWithEmailAndPassword(value('email'),$('password').value);});
  });
  $('googleLogin').addEventListener('click',()=>withBusy(async()=>{await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());}));
  $('logout').addEventListener('click',event=>{event.preventDefault();withBusy(async()=>firebase.auth().signOut());});
  $('load').addEventListener('click',()=>withBusy(openWorkspace));
  $('refresh').addEventListener('click',()=>withBusy(()=>refresh()));
  $('incidentForm').addEventListener('submit',event=>{event.preventDefault();withBusy(async()=>{
    await fn('createIspIncident',{orgId:state.orgId,title:value('incidentTitle'),description:value('incidentDescription'),segment:value('incidentSegment'),severity:value('incidentSeverity')});
    $('incidentForm').reset();await refresh('Incident recorded and audited.');
  });});
  $('orderForm').addEventListener('submit',event=>{event.preventDefault();withBusy(async()=>{
    const payload={orgId:state.orgId,title:value('orderTitle'),description:value('orderDescription'),
      assignedTo:value('assignedTo'),priority:value('orderPriority')};
    if(value('orderIncident')) payload.incidentId=value('orderIncident');
    await fn('createIspWorkOrder',payload);
    $('orderForm').reset();await refresh('Work order created and audited.');
  });});
  $('provisionForm').addEventListener('submit',event=>{event.preventDefault();withBusy(async()=>{
    await fn('queueIspProvisioningRequest',{orgId:state.orgId,accountReference:value('accountReference'),
      serviceType:value('serviceType'),packageMbps:Number(value('packageMbps')),notes:value('provisionNotes')});
    $('provisionForm').reset();await refresh('Request queued for manual review. No service has been activated.');
  });});
  try {
    firebase.auth().onAuthStateChanged(user=>{
      if(user) onSignedIn(user).catch(error=>feedback(error.message,true));
      else onSignedOut();
    },error=>feedback(error.message,true));
  }catch(error){feedback('Firebase Hosting configuration is unavailable: '+error.message,true);}
})();