import {identifier,money} from './domain.js';
export function validatePosCart(items){
 if(!Array.isArray(items)||items.length<1||items.length>30)throw new Error('Cart needs 1–30 products');
 const seen=new Set();
 return items.map(item=>{
  const productId=identifier(item?.productId);
  if(seen.has(productId))throw new Error('Duplicate product in cart');
  seen.add(productId);
  if(!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>10000)
   throw new Error('Invalid cart quantity');
  return {productId,quantity:item.quantity};
 });
}
export function pricePosCart(items,products){
 const lines=items.map(item=>{
  const product=products.get(item.productId);
  if(!product||!Number.isSafeInteger(product.stock)||product.stock<item.quantity)
   throw new Error('Insufficient product inventory');
  const price=money(product.price),total=money(price*item.quantity);
  if(!price||!Number.isSafeInteger(price*item.quantity))throw new Error('Invalid product price');
  return {productId:item.productId,quantity:item.quantity,name:product.name,unitPriceMinor:price,totalMinor:total};
 });
 const total=lines.reduce((v,line)=>v+line.totalMinor,0);
 if(!Number.isSafeInteger(total)||total<=0)throw new Error('Invalid cart total');
 return {lines,total};
}
