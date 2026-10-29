// Product families are navigation categories, not a statement of CSP eligibility.
// Live Partner Center offers, market availability, SKUs and prices must be verified.
export const microsoftProductFamilies=Object.freeze([
 {id:'m365',name:'Microsoft 365 and Office 365',examples:['Business Basic','Business Standard','Business Premium','E3','E5','Teams','Copilot']},
 {id:'azure',name:'Microsoft Azure',examples:['Azure plan','Reservations','Savings plans','Azure support']},
 {id:'dynamics',name:'Dynamics 365',examples:['Sales','Customer Service','Business Central','Finance','Supply Chain Management','Field Service']},
 {id:'power',name:'Power Platform',examples:['Power BI','Power Apps','Power Automate','Power Pages','Copilot Studio']},
 {id:'security',name:'Microsoft Security',examples:['Defender','Entra','Intune','Purview','Priva']},
 {id:'windows365',name:'Windows 365 and Windows',examples:['Cloud PC','Windows Enterprise']},
 {id:'server',name:'Server and developer software',examples:['Windows Server','SQL Server','Visual Studio','GitHub']},
 {id:'education',name:'Education and industry',examples:['Microsoft 365 Education','Industry cloud offers']},
 {id:'marketplace',name:'Marketplace and third-party offers',examples:['SaaS and eligible Marketplace offers']}
]);
export const microsoftResellerChecklist=Object.freeze([
 'Verify reseller relationship and Partner Center role',
 'Confirm customer tenant and market eligibility',
 'Verify reseller authorization for each actual SKU',
 'Record Microsoft Customer Agreement acceptance where required',
 'Confirm commercial quote, taxes and billing terms',
 'Obtain customer order approval',
 'Provision only through authorized Partner Center workflows',
 'Verify license assignment and customer handover'
]);
export function validateMicrosoftCatalogSelection(ids){
 if(!Array.isArray(ids)||ids.length===0||ids.length>microsoftProductFamilies.length||
    new Set(ids).size!==ids.length||
    ids.some(id=>!microsoftProductFamilies.some(f=>f.id===id)))
  throw new Error('Select unique supported Microsoft product families');
 return ids;
}
