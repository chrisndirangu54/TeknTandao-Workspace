import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,validateOptions,parseWorldBank,parseBoundaries,
  loadDataset,clearOpenDataCache} from '../src/kenya_open_data_domain.js';

const ok = data => ({ok:true,headers:{get:()=>null},json:async()=>data});
const rows=[{indicator:{id:'SP.POP.TOTL'},countryiso3code:'KEN',date:'2024',value:55000000},
  {indicator:{id:'SP.POP.TOTL'},countryiso3code:'KEN',date:'2023',value:54000000},
  {indicator:{id:'SP.POP.TOTL'},countryiso3code:'KEN',date:'2022',value:null},
  {indicator:{id:'SP.POP.TOTL'},countryiso3code:'UGA',date:'2024',value:44000000},
  {indicator:{id:'NY.GDP.MKTP.KD.ZG'},countryiso3code:'KEN',date:'2024',value:4}];

test('registry separates commercially restricted KNBS metadata from live sources',()=>{
  const c=catalog();
  assert.equal(c.sources.find(s=>s.id==='knbs').access,'catalog_only');
  assert.equal(c.sources.find(s=>s.id==='kenada').commercialUse,'restricted');
  assert.equal(c.datasets.find(s=>s.id==='population').geography,'Kenya national');
  assert.equal(c.datasets.find(s=>s.id==='county_boundaries').source.commercialUse,'attribution');
});
test('validation accepts bounded year ranges, rejects injection and huge requests',()=>{
  assert.deepEqual(validateOptions({fromYear:2020,toYear:2024,maxPoints:3}),
    {fromYear:2020,toYear:2024,maxPoints:3});
  for(const options of [{fromYear:2001,toYear:2000},{maxPoints:10000},
    {fromYear:'2020'},{fromYear:1959},{toYear:2101},[]]){
    assert.throws(()=>validateOptions(options));
  }
});
test('World Bank parsing removes nulls, wrong country and wrong indicator',()=>{
  const ds=catalog().datasets.find(x=>x.id==='population');
  const data=parseWorldBank([{},rows],ds,{fromYear:2022,toYear:2025,maxPoints:10});
  assert.deepEqual(data.series,[{year:2024,value:55000000},{year:2023,value:54000000}]);
  assert.deepEqual(data.latest,{year:2024,value:55000000});
  assert.equal(data.granularity,'national');
});
test('World Bank queries are fixed Kenya national indicators and cached',async()=>{
  clearOpenDataCache();
  let calls=0;
  const fetcher=async url=>{
    calls++;
    assert.ok(url.startsWith('https://api.worldbank.org/v2/country/KEN/indicator/SP.POP.TOTL?'));
    assert.ok(url.includes('date=2020%3A2024'));
    return ok([{},rows]);
  };
  const args={fromYear:2020,toYear:2024,maxPoints:10};
  const first=await loadDataset('population',args,fetcher);
  const second=await loadDataset('population',args,fetcher);
  assert.equal(first.cached,false);
  assert.equal(second.cached,true);
  assert.equal(calls,1);
  assert.equal(first.latest.year,2024);
  assert.equal(first.geography,'Kenya national');
  assert.equal(first.sourceId,'world_bank');
});
test('geoBoundaries returns metadata and download URL but no fake parcel geometry',async()=>{
  clearOpenDataCache();
  const metadata={boundaryID:'KEN-ADM1-sample',boundaryYearRepresented:'2019',
    gjDownloadURL:'https://example.org/county.geojson',boundaryLicense:'CC BY 4.0'};
  const result=await loadDataset('county_boundaries',{maxPoints:1},async url=>{
    assert.equal(url,'https://www.geoboundaries.org/api/current/gbOpen/KEN/ADM1/');
    return ok(metadata);
  });
  assert.equal(result.granularity,'county');
  assert.equal(result.geometryIncluded,false);
  assert.equal(result.downloadGeoJsonUrl,metadata.gjDownloadURL);
  assert.equal(result.commercialUse,'attribution');
});
test('rejects unknown dataset IDs, untrusted urls, broken upstream payloads',async()=>{
  clearOpenDataCache();
  await assert.rejects(loadDataset('https://evil.example/api'),RangeError);
  await assert.rejects(loadDataset('__proto__'),RangeError);
  await assert.rejects(loadDataset('population',{},async()=>ok({bad:'format'})),
    /invalid_world_bank_response/);
  await assert.rejects(loadDataset('county_boundaries',{},async()=>ok({bad:'format'})),
    /invalid_geoboundaries_response/);
  await assert.rejects(loadDataset('population',{},async()=>({ok:false})),
    /upstream_unavailable/);
  assert.throws(()=>parseBoundaries(null));
});
