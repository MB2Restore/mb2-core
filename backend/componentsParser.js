// ===== XACTIMATE COMPONENTS REPORT READER =====
// Splits each budget category into Materials and Labor (dollars only, DJ Nov 13).
// Rule: the category total from the estimate stays the official number.
//   Materials = material + equipment component lines whose code belongs to that category.
//   Labor     = category total - materials (so labor trades that don't match the
//               material trade, e.g. vinyl plank installed by "Wood Flooring Installer", still land right).
// Categories with no material components (e.g. Labor Only, supervision) show as not split.
const { extractLines } = require('./estimateParser');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const NUM = '[\\d,]+\\.\\d+';
const ITEM = new RegExp(`^\\s*(\\S+)\\s{2,}(.+?)\\s{2,}(${NUM})\\s+([A-Z]{2})\\s+@\\s+(${NUM})\\s+(${NUM})\\*?\\s*$`);

// Component code prefix -> candidate Xactimate categories (first one present on the budget wins).
const CODE_MAP = [
  ['FCW', ['FLOOR COVERING - WOOD']],
  ['FCV', ['FLOOR COVERING - VINYL', 'FLOOR COVERING - WOOD', 'FLOOR COVERING - CERAMIC TILE', 'FLOOR COVERING - CARPET']],
  ['FCC', ['FLOOR COVERING - CARPET']],
  ['FCT', ['FLOOR COVERING - CERAMIC TILE', 'TILE']],
  ['FCS', ['FLOOR COVERING - STONE']],
  ['FCR', ['FLOOR COVERING - RESILIENT SHEET', 'FLOOR COVERING - VINYL']],
  ['FCU', ['FLOOR COVERING - WOOD', 'FLOOR COVERING - VINYL', 'FLOOR COVERING - CERAMIC TILE', 'FLOOR COVERING - CARPET']],
  ['TIL', ['FLOOR COVERING - CERAMIC TILE', 'TILE']],
  ['MASMIX', ['FLOOR COVERING - CERAMIC TILE', 'TILE', 'MASONRY']],
  ['DRY', ['DRYWALL']],
  ['PNTMASK', ['PAINTING']], ['PNT', ['PAINTING']], ['PLAS', ['PAINTING']],
  ['FNC', ['FINISH CARPENTRY / TRIMWORK']], ['NAIL', ['FINISH CARPENTRY / TRIMWORK']], ['FRM', ['FINISH CARPENTRY / TRIMWORK', 'FRAMING & ROUGH CARPENTRY']],
  ['PNL', ['PANELING & WOOD WALL FINISHES']],
  ['INS', ['INSULATION']],
  ['LIT', ['LIGHT FIXTURES']],
  ['ELE', ['ELECTRICAL']],
  ['PLM', ['PLUMBING']],
  ['HVC', ['HEAT, VENT & AIR CONDITIONING']],
  ['CLN', ['CLEANING']],
  ['DMO', ['GENERAL DEMOLITION']],
  ['PLA', ['INTERIOR LATH & PLASTER', 'DRYWALL']],
  ['MPR', ['MOISTURE PROTECTION']], ['WTRPT', ['MOISTURE PROTECTION', 'PAINTING']],
  ['CAB', ['CABINETRY']], ['APP', ['APPLIANCES']], ['DOR', ['DOORS']], ['WDW', ['WINDOWS - VINYL', 'WINDOWS - WOOD']],
  ['WPR', ['WALLPAPER']], ['RFG', ['ROOFING']], ['SDG', ['SIDING']], ['TBA', ['TOILET & BATH ACCESSORIES']],
  ['MBL', ['MARBLE - CULTURED OR NATURAL']], ['CON', ['CONCRETE & ASPHALT']], ['ACT', ['ACOUSTICAL TREATMENTS']],
].sort((a, b) => b[0].length - a[0].length);

// Labor trade code -> category, used only to mark a category with NO material components as 100% labor.
const LABOR_MAP = [
  ['PLM', ['PLUMBING']], ['CLN', ['CLEANING']], ['DRY', ['DRYWALL']], ['PNT', ['PAINTING']],
  ['INS', ['INSULATION']], ['ELE', ['ELECTRICAL', 'LIGHT FIXTURES']], ['HVC', ['HEAT, VENT & AIR CONDITIONING']],
  ['DMO', ['GENERAL DEMOLITION']], ['TIL', ['FLOOR COVERING - CERAMIC TILE', 'TILE']],
  ['CARP', ['FINISH CARPENTRY / TRIMWORK']], ['FLR', ['FLOOR COVERING - WOOD', 'FLOOR COVERING - VINYL', 'FLOOR COVERING - CARPET']],
];

function parseComponents(lines) {
  let sec = null; const items = []; const totals = {};
  for (const l of lines) {
    if (/MATERIAL COMPONENTS/.test(l)) { sec = 'material'; continue; }
    if (/EQUIPMENT COMPONENTS/.test(l)) { sec = 'equipment'; continue; }
    if (/LABOR COMPONENTS/.test(l)) { sec = 'labor'; continue; }
    if (!sec) continue;
    const m = l.trimEnd().match(ITEM);
    if (m) { items.push({ sec, code: m[1], description: m[2].trim(), total: parseFloat(m[6].replace(/,/g, '')) }); continue; }
    const t = l.match(/^\s*Total\s.*?([\d,]+\.\d{2})\s*$/);
    if (t) totals[sec] = parseFloat(t[1].replace(/,/g, ''));
  }
  if (!items.length) throw new Error('No MATERIAL / LABOR COMPONENTS found. Export the Xactimate components report as a PDF.');
  return { items, totals };
}

// budgetLines: [{category, pre_op, bid_amount, budget}] from the job's current budget.
function splitBudget(componentLines, budgetLines, budgetPct = 0.75) {
  const { items, totals } = parseComponents(componentLines);
  const have = new Set(budgetLines.map((l) => l.category));
  const matByCat = new Map(); const unmapped = [];
  for (const it of items.filter((i) => i.sec !== 'labor')) {
    const entry = CODE_MAP.find(([p]) => it.code.toUpperCase().startsWith(p));
    const cat = entry && entry[1].find((c) => have.has(c));
    if (!cat) { unmapped.push(it); continue; }
    matByCat.set(cat, (matByCat.get(cat) || 0) + it.total);
  }
  const laborCats = new Set();
  for (const it of items.filter((i) => i.sec === 'labor')) {
    const entry = LABOR_MAP.find(([p]) => it.code.toUpperCase().startsWith(p));
    const cat = entry && entry[1].find((c) => have.has(c));
    if (cat) laborCats.add(cat);
  }
  const lines = budgetLines.map((l) => {
    const nonBid = round2(l.pre_op - (l.bid_amount || 0));
    let mat = matByCat.get(l.category);
    if (mat === undefined && laborCats.has(l.category)) mat = 0;   // labor-only trade (e.g. plumber)
    if (mat === undefined || nonBid <= 0) return { category: l.category, split: false };
    mat = round2(Math.min(mat, nonBid));
    const lab = round2(nonBid - mat);
    return {
      category: l.category, split: true,
      materials_xact: mat, labor_xact: lab,
      materials_budget: round2(mat * budgetPct), labor_budget: round2(lab * budgetPct),
      bid_budget: round2(l.bid_amount || 0),
    };
  });
  const materialTotal = round2((totals.material || 0) + (totals.equipment || 0));
  return {
    lines,
    report_total: round2(materialTotal + (totals.labor || 0)),
    materials_total: materialTotal,
    labor_total: round2(totals.labor || 0),
    unmapped_materials: round2(unmapped.reduce((a, i) => a + i.total, 0)),
    unmapped_codes: [...new Set(unmapped.map((i) => i.code))],
  };
}

async function readComponents(buffer, budgetLines, budgetPct) {
  return splitBudget(await extractLines(buffer), budgetLines, budgetPct);
}
module.exports = { readComponents, splitBudget, parseComponents };
