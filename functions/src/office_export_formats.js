import {Buffer} from 'node:buffer';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const body=[], central=[]; let offset=0;
  for (const [name,raw] of Object.entries(entries)) {
    const data=Buffer.isBuffer(raw)?raw:Buffer.from(String(raw),'utf8'), filename=Buffer.from(name,'utf8'), crc=crc32(data);
    const local=Buffer.alloc(30); local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt32LE(crc,14); local.writeUInt32LE(data.length,18); local.writeUInt32LE(data.length,22); local.writeUInt16LE(filename.length,26);
    body.push(local,filename,data);
    const cd=Buffer.alloc(46); cd.writeUInt32LE(0x02014b50,0); cd.writeUInt16LE(20,4); cd.writeUInt16LE(20,6); cd.writeUInt32LE(crc,16); cd.writeUInt32LE(data.length,20); cd.writeUInt32LE(data.length,24); cd.writeUInt16LE(filename.length,28); cd.writeUInt32LE(offset,42);
    central.push(cd,filename); offset+=local.length+filename.length+data.length;
  }
  const centralBytes=Buffer.concat(central), end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(Object.keys(entries).length,8); end.writeUInt16LE(Object.keys(entries).length,10); end.writeUInt32LE(centralBytes.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...body,centralBytes,end]);
}
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const csvCell=value=>{const text=String(value??'');return /[",\n\r]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;};
export function buildCsv(rows){if(!rows.length)return Buffer.from('','utf8');const cols=[...new Set(rows.flatMap(row=>Object.keys(row)))];return Buffer.from([cols.map(csvCell).join(','),...rows.map(row=>cols.map(c=>csvCell(row[c])).join(','))].join('\r\n'),'utf8');}

function colName(index){let n=index+1,out='';while(n>0){n-=1;out=String.fromCharCode(65+(n%26))+out;n=Math.floor(n/26);}return out;}
function sheetXml(rows){
  const cols=rows.length?[...new Set(rows.flatMap(row=>Object.keys(row)))]:['No data'],all=[Object.fromEntries(cols.map(c=>[c,c])),...rows];
  const rowsXml=all.map((row,r)=>'<row r="'+(r+1)+'">'+cols.map((c,i)=>{const v=row[c]??'',ref=colName(i)+(r+1);if(typeof v==='number'&&Number.isFinite(v))return '<c r="'+ref+'"><v>'+v+'</v></c>';if(typeof v==='boolean')return '<c r="'+ref+'" t="b"><v>'+(v?1:0)+'</v></c>';return '<c r="'+ref+'" t="inlineStr"><is><t>'+esc(v)+'</t></is></c>';}).join('')+'</row>').join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+rowsXml+'</sheetData></worksheet>';
}
export function buildXlsx(tables){
  const items=Object.entries(tables).slice(0,20),sheets=items.map(([name],i)=>({id:i+1,name:String(name).replace(/[\\/*?:[\]]/g,' ').slice(0,31)||('Sheet'+(i+1))}));
  const overrides=sheets.map(s=>'<Override PartName="/xl/worksheets/sheet'+s.id+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('');
  const sheetNodes=sheets.map(s=>'<sheet name="'+esc(s.name)+'" sheetId="'+s.id+'" r:id="rId'+s.id+'"/>').join('');
  const rels=sheets.map(s=>'<Relationship Id="rId'+s.id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+s.id+'.xml"/>').join('');
  const entries={
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+overrides+'</Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheetNodes+'</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rels+'</Relationships>',
  };
  items.forEach(([,rows],i)=>{entries['xl/worksheets/sheet'+(i+1)+'.xml']=sheetXml(rows);}); return zip(entries);
}

function paragraph(text,bold=false){return '<w:p><w:r>'+(bold?'<w:rPr><w:b/></w:rPr>':'')+'<w:t xml:space="preserve">'+esc(text)+'</w:t></w:r></w:p>';}
export function buildDocx(title,sections){
  const body=[paragraph(title,true),...sections.flatMap(s=>[paragraph(s.heading,true),...(s.lines||[]).map(line=>paragraph(line))])].join('');
  return zip({
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>',
  });
}

function textShape(id,x,y,cx,cy,text,size=2200,bold=false){return '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="Text '+id+'"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="'+x+'" y="'+y+'"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="'+size+'"'+(bold?' b="1"':'')+'/><a:t>'+esc(text)+'</a:t></a:r><a:endParaRPr lang="en-US" sz="'+size+'"/></a:p></p:txBody></p:sp>';}
function barShape(id,x,y,cx,cy){return '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="Bar '+id+'"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="'+x+'" y="'+y+'"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="2563EB"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>';}
function slideXml(title,lines=[],bars=[]){
  let id=2,shapes=[textShape(id++,650000,350000,10800000,700000,title,3000,true)];
  if(bars.length){let y=1400000;const max=Math.max(1,...bars.map(x=>Number(x.value)||0));for(const item of bars.slice(0,6)){shapes.push(textShape(id++,700000,y,2200000,380000,item.label,1300,false));const w=Math.max(100000,Math.round((Number(item.value)||0)/max*6500000));shapes.push(barShape(id++,3000000,y+30000,w,240000));shapes.push(textShape(id++,9700000,y,1200000,380000,String(item.value),1300,true));y+=650000;}}else{let y=1300000;for(const line of lines.slice(0,12)){shapes.push(textShape(id++,800000,y,10000000,480000,'• '+line,1700,false));y+=500000;}}
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'+shapes.join('')+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
}
export function buildPptx(slides){
  const list=slides.slice(0,20),overrides=list.map((_,i)=>'<Override PartName="/ppt/slides/slide'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>').join(''),ids=list.map((_,i)=>'<p:sldId id="'+(256+i)+'" r:id="rId'+(i+2)+'"/>').join(''),rels=['<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>',...list.map((_,i)=>'<Relationship Id="rId'+(i+2)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide'+(i+1)+'.xml"/>')].join('');
  const entries={
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'+overrides+'</Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
    'ppt/presentation.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>'+ids+'</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>',
    'ppt/_rels/presentation.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rels+'</Relationships>',
    'ppt/slideMasters/slideMaster1.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>',
    'ppt/slideMasters/_rels/slideMaster1.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>',
    'ppt/slideLayouts/slideLayout1.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>',
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>',
    'ppt/theme/theme1.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="TeknTandao"><a:themeElements><a:clrScheme name="TeknTandao"><a:dk1><a:srgbClr val="0F172A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="334155"/></a:dk2><a:lt2><a:srgbClr val="F8FAFC"/></a:lt2><a:accent1><a:srgbClr val="2563EB"/></a:accent1><a:accent2><a:srgbClr val="7C3AED"/></a:accent2><a:accent3><a:srgbClr val="059669"/></a:accent3><a:accent4><a:srgbClr val="D97706"/></a:accent4><a:accent5><a:srgbClr val="DC2626"/></a:accent5><a:accent6><a:srgbClr val="0891B2"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>',
  };
  list.forEach((s,i)=>{entries['ppt/slides/slide'+(i+1)+'.xml']=slideXml(s.title,s.lines,s.bars);entries['ppt/slides/_rels/slide'+(i+1)+'.xml.rels']='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>';});return zip(entries);
}

function pdfEscape(text){return String(text).replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');}
export function buildPdf(title,lines){
  const chunks=[title,'',...lines].map(String),pages=[];for(let i=0;i<chunks.length;i+=40)pages.push(chunks.slice(i,i+40));
  const objects=[],add=v=>(objects.push(v),objects.length),font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),refs=[];
  for(const pageLines of pages){let stream='BT /F1 12 Tf 48 790 Td 15 TL ';pageLines.forEach((line,i)=>{if(i)stream+='T* ';stream+='('+pdfEscape(line.slice(0,160))+') Tj ';});stream+='ET';refs.push({content:add('<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream')});}
  const pagesId=objects.length+refs.length+1,real=[];for(const p of refs)real.push(add('<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 '+font+' 0 R >> >> /Contents '+p.content+' 0 R >>'));add('<< /Type /Pages /Kids ['+real.map(id=>id+' 0 R').join(' ')+'] /Count '+real.length+' >>');const catalog=add('<< /Type /Catalog /Pages '+pagesId+' 0 R >>');
  let out='%PDF-1.4\n';const offsets=[0];objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';});const xref=Buffer.byteLength(out);out+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';for(let i=1;i<=objects.length;i++)out+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';out+='trailer\n<< /Size '+(objects.length+1)+' /Root '+catalog+' 0 R >>\nstartxref\n'+xref+'\n%%EOF';return Buffer.from(out,'binary');
}
