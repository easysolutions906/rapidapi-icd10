import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DATA_DIR = join(PROJECT_ROOT, 'src', 'data');
const TEMP_DIR = join(PROJECT_ROOT, 'tmp');
const OUTPUT_FILE = join(DATA_DIR, 'icd10.json');

const CMS_ZIP_URL = 'https://www.cms.gov/files/zip/2025-code-descriptions-tabular-order.zip';

const formatCode = (raw) => {
  const code = raw.trim();
  if (code.length <= 3) {
    return code;
  }
  return `${code.slice(0, 3)}.${code.slice(3)}`;
};

const parseLine = (line) => {
  if (line.length < 17) {
    return null;
  }

  // CMS order file format (1-indexed positions):
  // 1-5: order number, 7-13: code (no dot), 15: header flag (0=header, 1=billable), 17-77: short desc
  const code = line.slice(6, 13).trim();
  const headerFlag = line.slice(14, 15).trim();
  const shortDesc = line.slice(16, 77).trim();

  // Keep only billable/detail codes (flag = 1)
  if (headerFlag !== '1' || !code) {
    return null;
  }

  return {
    code: formatCode(code),
    description: shortDesc,
  };
};

const run = async () => {
  console.log('ICD-10-CM Data Builder');
  console.log('=====================\n');

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }

  const zipPath = join(TEMP_DIR, 'icd10cm.zip');

  try {
    console.log(`Downloading from CMS: ${CMS_ZIP_URL}`);
    const response = await fetch(CMS_ZIP_URL);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(zipPath, buffer);
    console.log(`Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB\n`);

    console.log('Extracting zip...');
    execSync(`unzip -o "${zipPath}" -d "${TEMP_DIR}"`, { stdio: 'pipe' });

    const extractedFiles = readdirSync(TEMP_DIR);
    console.log('Extracted files:', extractedFiles);

    const orderFile = extractedFiles.find(
      (f) => f.toLowerCase().includes('order') && f.endsWith('.txt')
    );

    if (!orderFile) {
      throw new Error(`Could not find order file. Files found: ${extractedFiles.join(', ')}`);
    }

    console.log(`\nParsing: ${orderFile}`);
    const content = readFileSync(join(TEMP_DIR, orderFile), 'utf-8');
    const lines = content.split(/\r?\n/);

    const codes = lines
      .map(parseLine)
      .filter(Boolean);

    console.log(`Parsed ${codes.length} detail codes from ${lines.length} total lines\n`);

    writeFileSync(OUTPUT_FILE, JSON.stringify(codes, null, 0));
    console.log(`Wrote ${OUTPUT_FILE}`);
    console.log(`File size: ${(readFileSync(OUTPUT_FILE).length / 1024 / 1024).toFixed(1)} MB`);

    const meta = {
      source: CMS_ZIP_URL,
      builtAt: new Date().toISOString(),
      recordCount: codes.length,
    };
    writeFileSync(join(DATA_DIR, 'meta.json'), JSON.stringify(meta, null, 2));
    console.log('Wrote meta.json');
  } catch (err) {
    console.error('\nError:', err.message);
    console.error('You may need to create the data file manually or check the CMS URL.');
    process.exit(1);
  } finally {
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true, force: true });
      console.log('\nCleaned up temp files.');
    }
  }
};

run();
