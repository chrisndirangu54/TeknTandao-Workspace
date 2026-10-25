// Bounded full-ledger scan, ordered by immutable Firestore document ID.
// Rejects overflow instead of returning an incomplete financial statement.
// Concurrent writes are not snapshot-isolated across pages; use closed periods
// or an immutable reporting snapshot for finalized financial statements.
export async function readBoundedJournals(collection,{pageSize=250,maxJournals=5000}={}){
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>500||
   !Number.isInteger(maxJournals)||maxJournals<1)throw new Error('Invalid ledger pagination settings');
 const journals=[];
 let cursor=null;
 while(true){
   let query=collection.orderBy('__name__').limit(Math.min(pageSize,maxJournals-journals.length+1));
   if(cursor)query=query.startAfter(cursor);
   const page=await query.get();
   for(const doc of page.docs){
     journals.push(doc.data());
     if(journals.length>maxJournals)throw new Error('Ledger exceeds bounded reporting limit');
   }
   if(page.empty||page.size<Math.min(pageSize,maxJournals-journals.length+1))break;
   cursor=page.docs.at(-1);
 }
 return journals;
}
