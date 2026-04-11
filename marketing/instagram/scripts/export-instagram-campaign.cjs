/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
const fs = require('fs/promises');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith('--')) {
      continue;
    }
    if (!value || value.startsWith('--')) {
      result[key.slice(2)] = 'true';
      continue;
    }
    result[key.slice(2)] = value;
    i += 1;
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const instagramRoot = path.resolve(__dirname, '..');
  const projectRoot = path.resolve(instagramRoot, '..', '..');

  const htmlPath = args.input
    ? path.resolve(projectRoot, args.input)
    : path.join(instagramRoot, 'templates', 'sayback-instagram-prism-campaign-v1.html');

  const outputDir = args.out
    ? path.resolve(projectRoot, args.out)
    : path.join(instagramRoot, 'outputs', 'prism-campaign-v1');

  const filePrefix = args.prefix ?? 'sayback-prism-v1';

  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 5200, height: 5200 } });

  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const creatives = await page.$$('.creative');

  if (!creatives.length) {
    throw new Error('No creatives found in template.');
  }

  const writtenFiles = [];

  for (let index = 0; index < creatives.length; index += 1) {
    const creative = creatives[index];
    const kind = (await creative.getAttribute('data-kind')) ?? 'asset';
    const slug = (await creative.getAttribute('data-slug')) ?? `creative-${String(index + 1).padStart(2, '0')}`;
    const bbox = await creative.boundingBox();

    const fileName = `${filePrefix}-${String(index + 1).padStart(2, '0')}-${kind}-${slug}.png`;
    const filePath = path.join(outputDir, fileName);

    await creative.screenshot({ path: filePath });

    writtenFiles.push({
      index: index + 1,
      kind,
      slug,
      width: Math.round(bbox?.width ?? 0),
      height: Math.round(bbox?.height ?? 0),
      file: path.relative(projectRoot, filePath),
    });
  }

  await browser.close();

  const manifestPath = path.join(outputDir, 'manifest.json');

  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceTemplate: path.relative(projectRoot, htmlPath),
        count: writtenFiles.length,
        files: writtenFiles,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(`Generated ${writtenFiles.length} campaign images in ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
