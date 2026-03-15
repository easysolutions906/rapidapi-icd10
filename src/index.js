import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3011;
const MAX_BATCH_SIZE = 50;
const DEFAULT_SEARCH_LIMIT = 25;
const MAX_SEARCH_LIMIT = 100;

// ICD-10-CM chapter ranges
const CHAPTERS = {
  1:  { range: ['A00', 'B99'], title: 'Certain infectious and parasitic diseases' },
  2:  { range: ['C00', 'D49'], title: 'Neoplasms' },
  3:  { range: ['D50', 'D89'], title: 'Diseases of the blood and blood-forming organs' },
  4:  { range: ['E00', 'E89'], title: 'Endocrine, nutritional and metabolic diseases' },
  5:  { range: ['F01', 'F99'], title: 'Mental, behavioral and neurodevelopmental disorders' },
  6:  { range: ['G00', 'G99'], title: 'Diseases of the nervous system' },
  7:  { range: ['H00', 'H59'], title: 'Diseases of the eye and adnexa' },
  8:  { range: ['H60', 'H95'], title: 'Diseases of the ear and mastoid process' },
  9:  { range: ['I00', 'I99'], title: 'Diseases of the circulatory system' },
  10: { range: ['J00', 'J99'], title: 'Diseases of the respiratory system' },
  11: { range: ['K00', 'K95'], title: 'Diseases of the digestive system' },
  12: { range: ['L00', 'L99'], title: 'Diseases of the skin and subcutaneous tissue' },
  13: { range: ['M00', 'M99'], title: 'Diseases of the musculoskeletal system and connective tissue' },
  14: { range: ['N00', 'N99'], title: 'Diseases of the genitourinary system' },
  15: { range: ['O00', 'O9A'], title: 'Pregnancy, childbirth and the puerperium' },
  16: { range: ['P00', 'P96'], title: 'Certain conditions originating in the perinatal period' },
  17: { range: ['Q00', 'Q99'], title: 'Congenital malformations, deformations and chromosomal abnormalities' },
  18: { range: ['R00', 'R99'], title: 'Symptoms, signs and abnormal clinical and laboratory findings' },
  19: { range: ['S00', 'T88'], title: 'Injury, poisoning and certain other consequences of external causes' },
  20: { range: ['V00', 'Y99'], title: 'External causes of morbidity' },
  21: { range: ['Z00', 'Z99'], title: 'Factors influencing health status and contact with health services' },
  22: { range: ['U00', 'U85'], title: 'Codes for special purposes' },
};

// --- Data loading ---

const loadData = () => {
  const raw = readFileSync(join(__dirname, 'data', 'icd10.json'), 'utf-8');
  const codes = JSON.parse(raw);

  // Map keyed by normalized code (no dots, uppercase)
  const codeMap = new Map();
  codes.forEach((entry) => {
    const normalized = entry.code.replace(/\./g, '').toUpperCase();
    codeMap.set(normalized, entry);
  });

  return { codes, codeMap };
};

const { codes: allCodes, codeMap } = loadData();
console.log(`Loaded ${allCodes.length} ICD-10-CM codes`);

// --- Helpers ---

const normalizeCode = (code) => code.replace(/[.\s-]/g, '').toUpperCase();

const formatCode = (raw) => {
  const clean = normalizeCode(raw);
  if (clean.length <= 3) {
    return clean;
  }
  return `${clean.slice(0, 3)}.${clean.slice(3)}`;
};

const getChapterForCode = (code) => {
  const prefix = code.slice(0, 3).toUpperCase();
  const entry = Object.entries(CHAPTERS).find(([, ch]) => {
    const [start, end] = ch.range;
    return prefix >= start && prefix <= end;
  });
  return entry ? { number: parseInt(entry[0], 10), ...entry[1] } : null;
};

const codeInChapterRange = (code, start, end) => {
  const prefix = code.replace(/\./g, '').slice(0, 3).toUpperCase();
  return prefix >= start && prefix <= end;
};

const sanitizeInput = (str) => {
  if (typeof str !== 'string') {
    return '';
  }
  return str.trim().slice(0, 200);
};

const scoreMatch = (description, terms) => {
  const lower = description.toLowerCase();
  const matchCount = terms.filter((t) => lower.includes(t)).length;
  const exactStart = terms.some((t) => lower.startsWith(t)) ? 2 : 0;
  return matchCount + exactStart;
};

// --- Middleware ---

const securityHeaders = (_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Cache-Control': 'no-store',
  });
  next();
};

// --- App setup ---

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(securityHeaders);

// --- Routes ---

app.get('/', (_req, res) => {
  res.json({
    name: 'ICD-10-CM Code Lookup API',
    version: '1.0.0',
    totalCodes: allCodes.length,
    endpoints: [
      { method: 'GET', path: '/health', description: 'Health check' },
      { method: 'GET', path: '/lookup?code=E11.9', description: 'Look up a specific ICD-10 code' },
      { method: 'GET', path: '/search?q=diabetes&limit=25', description: 'Search codes by keyword' },
      { method: 'GET', path: '/chapter/:chapter', description: 'List codes in a chapter (1-22)' },
      { method: 'POST', path: '/lookup/batch', description: 'Look up multiple codes (max 50)' },
      { method: 'GET', path: '/validate?code=E11.9', description: 'Validate if a code exists' },
    ],
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    codesLoaded: allCodes.length,
    timestamp: new Date().toISOString(),
  });
});

const metaPath = join(__dirname, 'data', 'meta.json');
const dataMeta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf-8')) : null;

app.get('/data-info', (_req, res) => {
  res.json({
    source: 'CMS ICD-10-CM 2025',
    url: 'https://www.cms.gov/medicare/coding-billing/icd-10-codes',
    recordCount: allCodes.length,
    builtAt: dataMeta?.builtAt || 'unknown',
    updateFrequency: 'annually (October)',
  });
});

app.get('/lookup', (req, res) => {
  const rawCode = sanitizeInput(req.query.code);

  if (!rawCode) {
    return res.status(400).json({ error: 'Missing required query parameter: code' });
  }

  const normalized = normalizeCode(rawCode);
  const entry = codeMap.get(normalized);

  if (!entry) {
    return res.status(404).json({
      error: 'Code not found',
      code: formatCode(rawCode),
      suggestion: 'Use /search?q=keyword to find codes by description',
    });
  }

  const chapter = getChapterForCode(entry.code);

  res.json({
    code: entry.code,
    description: entry.description,
    formatted: formatCode(entry.code),
    chapter: chapter ? { number: chapter.number, title: chapter.title } : null,
  });
});

app.get('/search', (req, res) => {
  const query = sanitizeInput(req.query.q);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit, 10) || DEFAULT_SEARCH_LIMIT, 1),
    MAX_SEARCH_LIMIT
  );

  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Query parameter "q" must be at least 2 characters' });
  }

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const results = allCodes
    .map((entry) => {
      const score = scoreMatch(entry.description, terms);
      return score > 0 ? { ...entry, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, ...entry }) => entry);

  res.json({
    query,
    count: results.length,
    results,
  });
});

app.get('/chapter/:chapter', (req, res) => {
  const chapterNum = parseInt(req.params.chapter, 10);
  const chapter = CHAPTERS[chapterNum];

  if (!chapter) {
    return res.status(400).json({
      error: `Invalid chapter number. Must be 1-22.`,
      chapters: Object.entries(CHAPTERS).map(([num, ch]) => ({
        number: parseInt(num, 10),
        range: ch.range.join('-'),
        title: ch.title,
      })),
    });
  }

  const [start, end] = chapter.range;
  const limit = Math.min(
    Math.max(parseInt(req.query.limit, 10) || 100, 1),
    1000
  );
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const chapterCodes = allCodes.filter((entry) =>
    codeInChapterRange(entry.code, start, end)
  );

  const page = chapterCodes.slice(offset, offset + limit);

  res.json({
    chapter: chapterNum,
    title: chapter.title,
    range: `${start}-${end}`,
    totalCodes: chapterCodes.length,
    offset,
    limit,
    count: page.length,
    codes: page,
  });
});

app.post('/lookup/batch', (req, res) => {
  const { codes } = req.body || {};

  if (!Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: 'Body must contain a "codes" array' });
  }

  if (codes.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ error: `Maximum ${MAX_BATCH_SIZE} codes per request` });
  }

  const results = codes.map((rawCode) => {
    const code = sanitizeInput(String(rawCode));
    const normalized = normalizeCode(code);
    const entry = codeMap.get(normalized);

    if (!entry) {
      return { code: formatCode(code), found: false };
    }

    const chapter = getChapterForCode(entry.code);
    return {
      code: entry.code,
      description: entry.description,
      found: true,
      chapter: chapter ? { number: chapter.number, title: chapter.title } : null,
    };
  });

  const found = results.filter((r) => r.found).length;

  res.json({
    requested: codes.length,
    found,
    notFound: codes.length - found,
    results,
  });
});

app.get('/validate', (req, res) => {
  const rawCode = sanitizeInput(req.query.code);

  if (!rawCode) {
    return res.status(400).json({ error: 'Missing required query parameter: code' });
  }

  const normalized = normalizeCode(rawCode);
  const entry = codeMap.get(normalized);
  const formatted = formatCode(rawCode);

  if (!entry) {
    return res.json({
      code: formatted,
      valid: false,
      message: 'Code not found in ICD-10-CM 2025',
    });
  }

  const chapter = getChapterForCode(entry.code);

  res.json({
    code: entry.code,
    valid: true,
    description: entry.description,
    formatted: entry.code,
    chapter: chapter ? { number: chapter.number, title: chapter.title } : null,
  });
});

// --- Error handling ---

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start ---

app.listen(PORT, () => {
  console.log(`ICD-10 API running on port ${PORT}`);
});
