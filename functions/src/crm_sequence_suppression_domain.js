export function suppressActiveEnrollments(enrollments,channel){
 if(!['email','whatsapp','call','all'].includes(channel))throw new Error('Invalid channel');
 if(!Array.isArray(enrollments)||enrollments.length>400)throw new Error('Suppression scan exceeds safe bounds');
 return enrollments.filter(e=>e.status==='active'&&(channel==='all'||e.channel===channel)).map(e=>e.id);
}
export function suppressionState(contact,records){
 return {doNotContact:contact?.doNotContact===true||contact?.optedOut===true,
  blockedChannels:['email','whatsapp','call'].filter(c=>records.some(r=>r.status==='suppressed'&&(r.channel==='all'||r.channel===c)))};
}
