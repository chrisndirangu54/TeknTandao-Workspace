export function validateCrmPageSize(value){
 if(!Number.isInteger(value)||value<1||value>100)throw new Error('Page size must be between 1 and 100');
 return value;
}
export function crmPageResult(documents,pageSize){
 validateCrmPageSize(pageSize);
 if(!Array.isArray(documents))throw new Error('Invalid page');
 const page=documents.slice(0,pageSize);
 return {records:page,hasMore:documents.length>pageSize,
  nextCursor:documents.length>pageSize?page.at(-1)?.id:null};
}
