// Bounded, deterministic journal scan. This does not provide a cross-page
// Firestore snapshot: finalized statements require a separately frozen ledger.
export async function readBoundedJournals(collection,{pageSize=250,maxJournals=5000}={}){
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>500||
    !Number.isInteger(maxJournals)||maxJournals<1)throw new Error('Invalid ledger pagination settings');
 const journals=[];
 let cursor=null,lastId=null;
 while(true){
   const requested=Math.min(pageSize,maxJournals-journals.length+1);
   let query=collection.orderBy('__name__').limit(requested);
   if(cursor)query=query.startAfter(cursor);
   const page=await query.get();
   if(!Array.isArray(page.docs)||page.docs.length>requested)
     throw new Error('Invalid ledger query response');
   for(const doc of page.docs){
     if(typeof doc.id!=='string'||!doc.id|| (lastId!==null&&doc.id<=lastId))
       throw new Error('Ledger pages contain duplicate or unordered journal IDs');
     lastId=doc.id;
     journals.push(doc.data());
     if(journals.length>maxJournals)throw new Error('Ledger exceeds bounded reporting limit');
   }
   if(page.docs.length<requested)break;
   if(!page.docs.length)break;
   cursor=page.docs.at(-1);
 }
 return journals;
}
