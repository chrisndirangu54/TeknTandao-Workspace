import {KENYA_SOURCE_EXTENSIONS} from './kenya_open_data_source_extensions.js';
// Kenya-first, read-only public-data registry. Never accept arbitrary upstream URLs.
const wb = 'https://api.worldbank.org/v2/country/KEN/indicator/';
const boundary = 'https://www.geoboundaries.org/api/current/gbOpen/KEN/ADM1/';
export const SOURCES = Object.freeze([
  {id:'world_bank', name:'World Bank Indicators API v2', homepage:'https://data.worldbank.org/country/kenya',
    api:'https://api.worldbank.org/v2/', licensing:'Dataset-specific World Bank Open Data terms; verify before commercial redistribution',
    commercialUse:'review', access:'live_api'},
  {id:'geoboundaries', name:'geoBoundaries gbOpen', homepage:'https://www.geoboundaries.org/',
    api:boundary, licensing:'gbOpen CC BY 4.0 or ODbL; inspect layer metadata and attribution/share-alike obligations',
    commercialUse:'attribution', access:'live_api'},
  {id:'knbs', name:'Kenya National Bureau of Statistics', homepage:'https://repository.knbs.or.ke/',
    api:'https://repository.knbs.or.ke/', licensing:'Repository default CC BY-NC 4.0 unless individual item says otherwise',
    commercialUse:'restricted', access:'catalog_only'},
  {id:'kenada', name:'KNBS Kenya National Data Archive', homepage:'https://statistics.knbs.or.ke/nada/index.php/home',
    api:'https://statistics.knbs.or.ke/nada/index.php/api/catalog/search',
    licensing:'Microdata and survey-specific access terms; do not ingest private records without approval',
    commercialUse:'restricted', access:'catalog_only'},
  ...KENYA_SOURCE_EXTENSIONS
]);
export const DATASETS = Object.freeze([
  {id:'population', title:'Population, total', sourceId:'world_bank', indicator:'SP.POP.TOTL', unit:'people', geography:'Kenya national', cadence:'annual'},
  {id:'urban_population_pct', title:'Urban population share', sourceId:'world_bank', indicator:'SP.URB.TOTL.IN.ZS', unit:'percent', geography:'Kenya national', cadence:'annual'},
  {id:'gdp_growth_pct', title:'GDP growth', sourceId:'world_bank', indicator:'NY.GDP.MKTP.KD.ZG', unit:'percent', geography:'Kenya national', cadence:'annual'},
  {id:'agriculture_gdp_pct', title:'Agriculture, forestry and fishing value added', sourceId:'world_bank', indicator:'NV.AGR.TOTL.ZS', unit:'percent of GDP', geography:'Kenya national', cadence:'annual'},
  {id:'electricity_access_pct', title:'Access to electricity', sourceId:'world_bank', indicator:'EG.ELC.ACCS.ZS', unit:'percent of population', geography:'Kenya national', cadence:'annual'},
  {id:'health_expenditure_pct', title:'Current health expenditure', sourceId:'world_bank', indicator:'SH.XPD.CHEX.GD.ZS', unit:'percent of GDP', geography:'Kenya national', cadence:'annual'},
  {id:'county_boundaries', title:'Kenya ADM1 county boundary metadata', sourceId:'geoboundaries', indicator:null, unit:'GeoJSON metadata', geography:'County boundaries (ADM1)', cadence:'periodic'},
]);
const byDataset = new Map(DATASETS.map(x => [x.id, x]));
const bySource = new Map(SOURCES.map(x => [x.id, x]));
const cache = new Map();
const ONE_HOUR = 3600_000;
const ONE_DAY = 24 * ONE_HOUR;
export function clearOpenDataCache() { cache.clear(); }
export function catalog() {
  return {sources:SOURCES, datasets:DATASETS.map(x => ({
    ...x, source:bySource.get(x.sourceId), readiness:'available_on_request',
    warning:x.geography === 'Kenya national' ? 'National series; cannot be attributed to an individual county or parcel.' :
      'Administrative boundaries are not official cadastral parcel boundaries.'
  }))};
}
export function validateOptions(options={}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Invalid options');
  const {fromYear=2000,toYear=new Date().getUTCFullYear(),maxPoints=30} = options;
  if (![fromYear,toYear,maxPoints].every(Number.isInteger) ||
      fromYear < 1960 || toYear > 2100 || fromYear > toYear ||
      maxPoints < 1 || maxPoints > 100) throw new RangeError('Invalid year range or result limit');
  return {fromYear,toYear,maxPoints};
}
function wbUrl(indicator, options) {
  const query = new URLSearchParams({format:'json',per_page:'150',
    date:String(options.fromYear) + ':' + String(options.toYear)});
  return wb + encodeURIComponent(indicator) + '?' + query.toString();
}
async function fetchJson(url, fetcher) {
  // URLs are composed entirely from constants and hard-coded indicator codes.
  const response = await fetcher(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(9000)});
  if (!response || !response.ok) throw new Error('upstream_unavailable');
  if (Number(response.headers?.get?.('content-length') || 0) > 3_000_000) throw new Error('upstream_too_large');
  return response.json();
}
export function parseWorldBank(payload, dataset, options) {
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) throw new Error('invalid_world_bank_response');
  const observations = payload[1]
    .filter(x=>x && x.indicator?.id === dataset.indicator &&
      x.countryiso3code === 'KEN' && /^\d{4}$/.test(String(x.date)) &&
      Number.isFinite(x.value))
    .map(x=>({year:Number(x.date),value:x.value}))
    .filter(x=>x.year >= options.fromYear && x.year <= options.toYear)
    .sort((a,b)=>b.year-a.year)
    .slice(0,options.maxPoints);
  return {series:observations, latest:observations[0] || null,
    granularity:'national', measuredNotPredicted:true,
    note:'Null periods omitted; each value retains its reference year.'};
}
export function parseBoundaries(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      typeof payload.boundaryID !== 'string') throw new Error('invalid_geoboundaries_response');
  const download = payload.gjDownloadURL;
  const validUrl = typeof download === 'string' && /^https:\/\//.test(download) ? download : null;
  return {boundaryId:payload.boundaryID, boundaryYearRepresented:payload.boundaryYearRepresented || null,
    source:payload.boundarySource || null, license:payload.boundaryLicense || 'Check upstream metadata',
    downloadGeoJsonUrl:validUrl, geometryIncluded:false,
    granularity:'county', note:'ADM1 geometry is not parcel ownership, cadastral proof, or a county census.'};
}
export async function loadDataset(datasetId, options={}, fetcher=fetch) {
  const dataset=byDataset.get(datasetId);
  if (!dataset) throw new RangeError('Unknown dataset ID');
  const valid=validateOptions(options);
  const key=datasetId + '|' + JSON.stringify(valid);
  const now=Date.now();
  const hit=cache.get(key);
  if (hit && hit.expires > now) return {...hit.value,cached:true};
  const url=dataset.sourceId === 'world_bank' ? wbUrl(dataset.indicator,valid) : boundary;
  const raw=await fetchJson(url,fetcher);
  const result=dataset.sourceId === 'world_bank' ?
    parseWorldBank(raw,dataset,valid) : parseBoundaries(raw);
  const source=bySource.get(dataset.sourceId);
  const record={datasetId, title:dataset.title, sourceId:source.id,
    sourceName:source.name, sourceUrl:url, commercialUse:source.commercialUse,
    license:source.licensing, geography:dataset.geography, unit:dataset.unit,
    fetchedAt:new Date().toISOString(), cached:false, ...result};
  if (cache.size >= 64) cache.delete(cache.keys().next().value);
  cache.set(key,{expires:now + (dataset.sourceId === 'geoboundaries' ? ONE_DAY : ONE_HOUR),value:record});
  return record;
}
