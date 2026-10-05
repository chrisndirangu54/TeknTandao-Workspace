import {deflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';

const u16=n=>Buffer.from([n&255,(n>>>8)&255]);
const u32=n=>Buffer.from([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);

let crcTable;
function crc32(buffer){
  if(!crcTable){
    crcTable=Array.from({length:256},(_,n)=>{
      let c=n;
      for(let k=0;k<8;k+=1)c=(c&1)?0xedb88320^(c>>>1):c>>>1;
      return c>>>0;
    });
  }
  let crc=0xffffffff;
  for(const byte of buffer)crc=crcTable[(crc^byte)&0xff]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function dosDateTime(date=new Date()){
  const year=Math.max(1980,date.getFullYear());
  const time=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);
  const day=((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
  return {time,day};
}
export function zipFiles(files){
  const locals=[],centrals=[];let offset=0;
  for(const file of files){
    const name=Buffer.from(file.name.replace(/^\/+/,''),'utf8');
    const data=Buffer.isBuffer(file.data)?file.data:Buffer.from(file.data);
    const compressed=deflateRawSync(data,{level:6});
    const crc=crc32(data),dt=dosDateTime();
    const local=Buffer.concat([
      Buffer.from([0x50,0x4b,0x03,0x04]),u16(20),u16(0),u16(8),u16(dt.time),u16(dt.day),
      u32(crc),u32(compressed.length),u32(data.length),u16(name.length),u16(0),name,compressed,
    ]);
    const central=Buffer.concat([
      Buffer.from([0x50,0x4b,0x01,0x02]),u16(20),u16(20),u16(0),u16(8),u16(dt.time),u16(dt.day),
      u32(crc),u32(compressed.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name,
    ]);
    locals.push(local);centrals.push(central);offset+=local.length;
  }
  const directory=Buffer.concat(centrals);
  const end=Buffer.concat([
    Buffer.from([0x50,0x4b,0x05,0x06]),u16(0),u16(0),u16(files.length),u16(files.length),
    u32(directory.length),u32(offset),u16(0),
  ]);
  return Buffer.concat([...locals,directory,end]);
}

const xmlEscape=value=>String(value??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'","&apos;");

function flattenAnalytics(intelligence){
  const facts=intelligence.facts||{};
  const rows=[
    ['Metric','Value'],
    ['Recorded sales (minor units)',facts.sales?.valueMinor??0],
    ['Recorded sales records',facts.sales?.count??0],
    ['Inventory SKUs',facts.inventory?.skuCount??0],
    ['Inventory units',facts.inventory?.units??0],
    ['Low-stock SKUs',facts.inventory?.lowStock??0],
    ['Out-of-stock SKUs',facts.inventory?.outOfStock??0],
    ['CRM contacts',facts.customers?.contacts??0],
    ['Open support tickets',facts.support?.open??0],
    ['High-priority support tickets',facts.support?.highPriorityOpen??0],
    ['Projects overdue',facts.projects?.overdue??0],
    ['Connected systems',facts.connectors?.connected??0],
    ['Healthy connectors',facts.connectors?.healthy??0],
    ['Degraded connectors',facts.connectors?.degraded??0],
    ['Sync conflicts',facts.connectors?.conflicts??0],
    ['Sync records created',facts.connectors?.recordsCreated??0],
    ['Sync records updated',facts.connectors?.recordsUpdated??0],
    ['Installed apps',facts.apps?.installed??0],
  ];
  return rows;
}
export function analyticsCsv(intelligence){
  return flattenAnalytics(intelligence).map(row=>row.map(value=>{
    const text=String(value??'');
    return /[",\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;
  }).join(',')).join('\r\n')+'\r\n';
}

function xlsxSheet(rows){
  const col=n=>{
    let s='';let x=n+1;
    while(x){x-=1;s=String.fromCharCode(65+(x%26))+s;x=Math.floor(x/26);}
    return s;
  };
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row,r)=>`<row r="${r+1}">${row.map((value,c)=>{
    const ref=`${col(c)}${r+1}`;
    return typeof value==='number'
      ?`<c r="${ref}"><v>${value}</v></c>`
      :`<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
  }).join('')}</row>`).join('')}</sheetData></worksheet>`;
}
export function analyticsXlsx(intelligence){
  const rows=flattenAnalytics(intelligence);
  const sales=intelligence.facts?.sales?.series||[];
  const salesRows=[['Period','Recorded sales','Count'],...sales.map(x=>[x.period,x.value,x.count])];
  return zipFiles([
    {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`},
    {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Executive KPIs" sheetId="1" r:id="rId1"/><sheet name="Sales Trend" sheetId="2" r:id="rId2"/></sheets></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`},
    {name:'xl/worksheets/sheet1.xml',data:xlsxSheet(rows)},
    {name:'xl/worksheets/sheet2.xml',data:xlsxSheet(salesRows)},
  ]);
}

function docxParagraph(text,bold=false){
  return `<w:p><w:r>${bold?'<w:rPr><w:b/></w:rPr>':''}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}
export function analyticsDocx(intelligence){
  const recs=intelligence.recommendations||[];
  const body=[
    docxParagraph('TeknTandao Executive Intelligence',true),
    docxParagraph(`Generated: ${new Date(intelligence.generatedAt||Date.now()).toISOString()}`),
    docxParagraph('Key Performance Indicators',true),
    ...flattenAnalytics(intelligence).slice(1).map(([k,v])=>docxParagraph(`${k}: ${v}`)),
    docxParagraph('Recommendations',true),
    ...recs.map(r=>docxParagraph(`${String(r.priority||'').toUpperCase()} — ${r.title}: ${r.reason} Action: ${r.action}`)),
    docxParagraph('Data note',true),
    docxParagraph('This report is a bounded operational view. Recorded sales are not necessarily collected cash.'),
  ].join('');
  return zipFiles([
    {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`},
    {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`},
    {name:'word/document.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr></w:body></w:document>`},
  ]);
}

function pptTextShape(id,x,y,cx,cy,text,size=1800,bold=false){
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="${size}"${bold?' b="1"':''}/><a:t>${xmlEscape(text)}</a:t></a:r></a:p></p:txBody></p:sp>`;
}
function pptRect(id,x,y,cx,cy,fill){
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Bar ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
}
function pptSlide(title,shapes){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:spPr/>${pptTextShape(2,600000,350000,11000000,700000,title,2800,true)}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}
export function analyticsPptx(intelligence){
  const facts=intelligence.facts||{};
  const kpis=[
    ['Recorded sales',facts.sales?.valueMinor??0],['Inventory SKUs',facts.inventory?.skuCount??0],
    ['CRM contacts',facts.customers?.contacts??0],['Open tickets',facts.support?.open??0],
    ['Overdue projects',facts.projects?.overdue??0],['Connected systems',facts.connectors?.connected??0],
  ];
  let shapes='';let id=3;
  kpis.forEach((item,index)=>{
    const col=index%3,row=Math.floor(index/3),x=600000+col*3700000,y=1500000+row*1800000;
    shapes+=pptRect(id++,x,y,3300000,1300000,'EAF2FF');
    shapes+=pptTextShape(id++,x+180000,y+180000,2900000,420000,item[0],1500,true);
    shapes+=pptTextShape(id++,x+180000,y+650000,2900000,420000,String(item[1]),2400,true);
  });
  const slide1=pptSlide('Executive KPI Snapshot',shapes);
  const series=facts.sales?.series||[];
  let chart='';id=3;
  const max=Math.max(1,...series.map(x=>Number(x.value)||0));
  series.forEach((item,index)=>{
    const w=900000,h=Math.round((Number(item.value)||0)/max*2800000);
    const x=900000+index*1700000,y=4800000-h;
    chart+=pptRect(id++,x,y,w,h,'2563EB');
    chart+=pptTextShape(id++,x-100000,4900000,1100000,350000,item.period,1100,false);
  });
  const slide2=pptSlide('Recorded Sales Trend',chart+pptTextShape(id++,650000,5550000,11000000,500000,'Recorded sales are not necessarily collected cash.',1200,false));
  const recs=(intelligence.recommendations||[]).slice(0,6);
  const recShapes=recs.map((r,i)=>pptTextShape(3+i,700000,1300000+i*700000,11000000,560000,`${String(r.priority||'').toUpperCase()} — ${r.title}: ${r.action}`,1300,i===0)).join('');
  const slide3=pptSlide('Management Recommendations',recShapes);

  const slideCount=3;
  const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${Array.from({length:slideCount},(_,i)=>`<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`;
  const presentation=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${Array.from({length:slideCount},(_,i)=>`<p:sldId id="${256+i}" r:id="rId${i+2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  const presRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${Array.from({length:slideCount},(_,i)=>`<Relationship Id="rId${i+2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i+1}.xml"/>`).join('')}</Relationships>`;
  const master=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
  const layout=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sldLayout>`;
  const theme=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="TeknTandao"><a:themeElements><a:clrScheme name="TeknTandao"><a:dk1><a:srgbClr val="0F172A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="334155"/></a:dk2><a:lt2><a:srgbClr val="F8FAFC"/></a:lt2><a:accent1><a:srgbClr val="2563EB"/></a:accent1><a:accent2><a:srgbClr val="7C3AED"/></a:accent2><a:accent3><a:srgbClr val="059669"/></a:accent3><a:accent4><a:srgbClr val="D97706"/></a:accent4><a:accent5><a:srgbClr val="DC2626"/></a:accent5><a:accent6><a:srgbClr val="64748B"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="TeknTandao"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="TeknTandao"/></a:themeElements></a:theme>`;
  const slideRel=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
  return zipFiles([
    {name:'[Content_Types].xml',data:contentTypes},
    {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`},
    {name:'ppt/presentation.xml',data:presentation},
    {name:'ppt/_rels/presentation.xml.rels',data:presRels},
    {name:'ppt/slideMasters/slideMaster1.xml',data:master},
    {name:'ppt/slideMasters/_rels/slideMaster1.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`},
    {name:'ppt/slideLayouts/slideLayout1.xml',data:layout},
    {name:'ppt/slideLayouts/_rels/slideLayout1.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`},
    {name:'ppt/theme/theme1.xml',data:theme},
    {name:'ppt/slides/slide1.xml',data:slide1},{name:'ppt/slides/_rels/slide1.xml.rels',data:slideRel},
    {name:'ppt/slides/slide2.xml',data:slide2},{name:'ppt/slides/_rels/slide2.xml.rels',data:slideRel},
    {name:'ppt/slides/slide3.xml',data:slide3},{name:'ppt/slides/_rels/slide3.xml.rels',data:slideRel},
  ]);
}

function pdfEscape(text){return String(text).replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');}
export function analyticsPdf(intelligence){
  const lines=[
    'TeknTandao Executive Intelligence',
    `Generated: ${new Date(intelligence.generatedAt||Date.now()).toISOString()}`,
    '',
    ...flattenAnalytics(intelligence).slice(1).map(([k,v])=>`${k}: ${v}`),
    '',
    'Recommendations',
    ...(intelligence.recommendations||[]).slice(0,8).map(r=>`${String(r.priority||'').toUpperCase()} - ${r.title}: ${r.action}`),
    '',
    'Data note: bounded operational view; recorded sales are not necessarily collected cash.',
  ];
  const content=['BT','/F1 11 Tf','50 790 Td'];
  for(let i=0;i<lines.length;i+=1){
    if(i>0)content.push('0 -17 Td');
    content.push(`(${pdfEscape(lines[i].slice(0,120))}) Tj`);
  }
  content.push('ET');
  const stream=content.join('\n');
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body='%PDF-1.4\n',offsets=[0];
  for(let i=0;i<objects.length;i+=1){offsets.push(Buffer.byteLength(body));body+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(body);
  body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i+=1)body+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  body+=`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

export const exportTypes=Object.freeze({
  csv:{ext:'csv',mime:'text/csv; charset=utf-8',make:i=>Buffer.from(analyticsCsv(i))},
  xlsx:{ext:'xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',make:analyticsXlsx},
  docx:{ext:'docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',make:analyticsDocx},
  pptx:{ext:'pptx',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation',make:analyticsPptx},
  pdf:{ext:'pdf',mime:'application/pdf',make:analyticsPdf},
});
export function exportFile(intelligence,format){
  const spec=exportTypes[format];
  if(!spec)throw new Error('Unsupported export format');
  const data=spec.make(intelligence);
  return {
    data,
    mime:spec.mime,
    ext:spec.ext,
    sha256:createHash('sha256').update(data).digest('hex'),
  };
}
