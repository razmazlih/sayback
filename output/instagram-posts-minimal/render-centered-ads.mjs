import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve('/Users/razmaz/Desktop/code/free_time/medium/SayBack/output/instagram-posts-minimal');
const DATA_PATH = resolve(ROOT, 'posts-minimal-data.json');

const posts = JSON.parse(readFileSync(DATA_PATH, 'utf8'));

const esc = (v) =>
  String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const shell = (title, styles, body) => `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1080, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      width: 1080px;
      height: 1350px;
      margin: 0;
      overflow: hidden;
      font-family: 'Rubik', sans-serif;
      direction: rtl;
      unicode-bidi: plaintext;
      position: relative;
      display: grid;
      place-items: center;
    }
    .poster {
      width: 920px;
      min-height: 980px;
      border-radius: 42px;
      padding: 42px 44px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 16px;
      box-shadow: 0 34px 80px #00000030;
      border: 2px solid #ffffff33;
      position: relative;
      overflow: hidden;
    }
    .angle {
      justify-self: start;
      border-radius: 999px;
      padding: 9px 16px;
      font-size: 22px;
      font-weight: 800;
      line-height: 1;
      backdrop-filter: blur(2px);
      width: fit-content;
      max-width: 100%;
    }
    .hook {
      margin: 0;
      font-size: 72px;
      line-height: 1.04;
      font-weight: 900;
      letter-spacing: -1px;
      text-wrap: balance;
    }
    .subhook {
      margin: 0;
      font-size: 31px;
      line-height: 1.3;
      font-weight: 500;
      text-wrap: balance;
    }
    .msg, .reply {
      border-radius: 18px;
      padding: 14px 16px;
      font-size: 29px;
      line-height: 1.28;
      font-weight: 600;
      text-wrap: pretty;
    }
    .cta {
      margin-top: 8px;
      border-radius: 18px;
      padding: 16px 20px;
      text-align: center;
      font-size: 35px;
      font-weight: 900;
      line-height: 1.15;
      text-wrap: balance;
    }

    ${styles}
  </style>
</head>
<body>${body}</body>
</html>`;

const templateWarm = (p) => {
  const styles = `
    body {
      background:
        radial-gradient(circle at 10% 12%, #ffd7708f 0%, transparent 34%),
        radial-gradient(circle at 92% 88%, #ff65252b 0%, transparent 36%),
        linear-gradient(155deg, #fff7e8 0%, #ffeac8 100%);
      color: #1a130f;
    }
    .poster {
      background: linear-gradient(180deg, #fffefb 0%, #fff2dd 100%);
      border-color: #f1ddc4;
    }
    .angle { background: #17120f; color: #fff; }
    .hook { color: #1a130f; }
    .subhook { color: #463326; }
    .msg { background: #efefef; color: #23180f; border: 1px solid #dedede; }
    .reply { background: #ffe6cb; color: #23180f; border: 2px solid #ffbc84; }
    .cta { background: linear-gradient(180deg,#ff5d17 0%,#ff4d00 100%); color: #fff; }
  `;

  const body = `
  <article class="poster">
    <div class="angle">${esc(p.angle)}</div>
    <h1 class="hook">${esc(p.hook)}</h1>
    <p class="subhook">${esc(p.subhook)}</p>
    <div class="msg">${esc(p.message)}</div>
    <div class="reply">${esc(p.reply)}</div>
    <div class="cta">${esc(p.cta)}</div>
  </article>`;

  return shell(`Centered Ad ${p.id}`, styles, body);
};

const templateDark = (p) => {
  const styles = `
    body {
      background:
        radial-gradient(circle at 12% 8%, #ffd2004d 0%, transparent 33%),
        radial-gradient(circle at 90% 78%, #ff4d0030 0%, transparent 36%),
        linear-gradient(165deg, #17110e 0%, #2a170f 100%);
      color: #fff5ea;
    }
    .poster {
      background: linear-gradient(180deg, #21150f 0%, #2d1a0f 100%);
      border-color: #ffffff2a;
    }
    .angle { background: #ffd400; color: #21140c; }
    .hook { color: #fff2e5; }
    .subhook { color: #ffd8be; }
    .msg { background: #ffffffeb; color: #22160f; border: 1px solid #ffffff; }
    .reply { background: #fff7ee; color: #22160f; border: 2px solid #ffc699; }
    .cta { background: #fff; color: #22160f; }
  `;

  const body = `
  <article class="poster">
    <div class="angle">${esc(p.angle)}</div>
    <h1 class="hook">${esc(p.hook)}</h1>
    <p class="subhook">${esc(p.subhook)}</p>
    <div class="msg">${esc(p.message)}</div>
    <div class="reply">${esc(p.reply)}</div>
    <div class="cta">${esc(p.cta)}</div>
  </article>`;

  return shell(`Centered Ad ${p.id}`, styles, body);
};

const templateGlass = (p) => {
  const styles = `
    body {
      background:
        radial-gradient(circle at 90% 12%, #ffe06c8e 0%, transparent 34%),
        radial-gradient(circle at 8% 88%, #ff6d2d30 0%, transparent 34%),
        linear-gradient(170deg, #fff8eb 0%, #ffe8c6 100%);
      color: #1b140f;
    }
    .poster {
      background: linear-gradient(180deg, #ffffffd9 0%, #fff6ead6 100%);
      border-color: #ffffff80;
      backdrop-filter: blur(10px);
    }
    .angle { background: #ff4d00; color: #fff; }
    .hook { color: #1a130f; }
    .subhook { color: #3f2d22; }
    .msg { background: #f1f1f1; color: #23180f; border: 1px solid #dfdfdf; }
    .reply { background: #ffe8cf; color: #23180f; border: 2px solid #ffbe88; }
    .cta { background: #17120f; color: #fff; }
  `;

  const body = `
  <article class="poster">
    <div class="angle">${esc(p.angle)}</div>
    <h1 class="hook">${esc(p.hook)}</h1>
    <p class="subhook">${esc(p.subhook)}</p>
    <div class="msg">${esc(p.message)}</div>
    <div class="reply">${esc(p.reply)}</div>
    <div class="cta">${esc(p.cta)}</div>
  </article>`;

  return shell(`Centered Ad ${p.id}`, styles, body);
};

const templates = [templateWarm, templateDark, templateGlass];

for (const post of posts) {
  const tpl = templates[(post.id - 31) % templates.length];
  const html = tpl(post);
  writeFileSync(resolve(ROOT, `centered-post-${post.id}.html`), html, 'utf8');
}

console.log(`Generated ${posts.length} centered ad HTML files.`);
