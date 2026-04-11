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

  const reportPath = args.report
    ? path.resolve(projectRoot, args.report)
    : path.join(instagramRoot, 'outputs', 'prism-campaign-v1', 'qa-report.json');

  await fs.mkdir(path.dirname(reportPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 5200, height: 5200 } });

  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const summary = await page.evaluate(() => {
    const expected = {
      post: { width: 1080, height: 1350, safe: { top: 48, right: 48, bottom: 48, left: 48 } },
      story: { width: 1080, height: 1920, safe: { top: 220, right: 48, bottom: 260, left: 48 } },
    };

    const creatives = Array.from(document.querySelectorAll('.creative'));
    const issues = [];
    const checks = [];

    let postCount = 0;
    let storyCount = 0;

    creatives.forEach((creative, index) => {
      const kind = creative.getAttribute('data-kind') || 'unknown';
      const slug = creative.getAttribute('data-slug') || `creative-${index + 1}`;
      const config = expected[kind];

      if (kind === 'post') postCount += 1;
      if (kind === 'story') storyCount += 1;

      const root = creative.getBoundingClientRect();
      const blocks = Array.from(creative.querySelectorAll('[data-block]')).map((el) => ({
        name: el.getAttribute('data-block') || 'block',
        rect: el.getBoundingClientRect(),
      }));

      const texts = Array.from(creative.querySelectorAll('[data-text]'));

      const localIssues = [];

      if (!config) {
        localIssues.push(`Unknown creative kind: ${kind}`);
      } else {
        const width = Math.round(root.width);
        const height = Math.round(root.height);

        if (width !== config.width || height !== config.height) {
          localIssues.push(`Invalid size ${width}x${height}, expected ${config.width}x${config.height}`);
        }

        blocks.forEach((block) => {
          const relative = {
            left: block.rect.left - root.left,
            top: block.rect.top - root.top,
            right: block.rect.right - root.left,
            bottom: block.rect.bottom - root.top,
          };

          const within =
            relative.left >= config.safe.left &&
            relative.top >= config.safe.top &&
            relative.right <= config.width - config.safe.right &&
            relative.bottom <= config.height - config.safe.bottom;

          if (!within) {
            localIssues.push(`Block "${block.name}" breaches safe area`);
          }
        });

        for (let i = 0; i < blocks.length; i += 1) {
          for (let j = i + 1; j < blocks.length; j += 1) {
            const a = blocks[i].rect;
            const b = blocks[j].rect;
            const overlap = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);

            if (overlap) {
              localIssues.push(`Overlap between "${blocks[i].name}" and "${blocks[j].name}"`);
            }
          }
        }

        texts.forEach((el) => {
          const style = window.getComputedStyle(el);
          const clipsY = style.overflowY !== 'visible' || style.overflow === 'hidden';
          const clipsX = style.overflowX !== 'visible' || style.overflow === 'hidden';

          if (clipsY && el.scrollHeight > el.clientHeight + 2) {
            const textPreview = (el.textContent || '').slice(0, 48);
            localIssues.push(`Text overflow detected: "${textPreview}"`);
          }
          if (clipsX && el.scrollWidth > el.clientWidth + 2) {
            const textPreview = (el.textContent || '').slice(0, 48);
            localIssues.push(`Horizontal overflow detected: "${textPreview}"`);
          }
        });
      }

      checks.push({
        index: index + 1,
        kind,
        slug,
        issueCount: localIssues.length,
        issues: localIssues,
      });

      for (const issue of localIssues) {
        issues.push({ creativeIndex: index + 1, kind, slug, issue });
      }
    });

    if (postCount !== 10) {
      issues.push({ creativeIndex: 0, kind: 'meta', slug: 'count', issue: `Expected 10 posts, got ${postCount}` });
    }

    if (storyCount !== 5) {
      issues.push({ creativeIndex: 0, kind: 'meta', slug: 'count', issue: `Expected 5 stories, got ${storyCount}` });
    }

    return {
      generatedAt: new Date().toISOString(),
      totalCreatives: creatives.length,
      postCount,
      storyCount,
      issues,
      checks,
    };
  });

  await browser.close();

  await fs.writeFile(reportPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  if (summary.issues.length > 0) {
    console.error(`QA failed with ${summary.issues.length} issues. See report: ${reportPath}`);
    process.exit(1);
  }

  console.log(`QA passed: ${summary.totalCreatives} creatives validated.`);
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
