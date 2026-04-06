import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve('/Users/razmaz/Desktop/code/free_time/medium/SayBack/output/instagram-posts');
const inputPath = resolve(ROOT, 'posts-data.json');

const data = JSON.parse(readFileSync(inputPath, 'utf8'));

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const pageShell = (title, body, extraStyles = '') => `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1080, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 1080px;
      height: 1350px;
      overflow: hidden;
      font-family: 'Rubik', sans-serif;
      direction: rtl;
      unicode-bidi: plaintext;
    }
    ${extraStyles}
  </style>
</head>
<body>
${body}
</body>
</html>
`;

const templateA = (post) => {
  const styles = `
    body {
      background:
        radial-gradient(circle at 8% 12%, #ffe38a 0%, #ffe38a00 34%),
        radial-gradient(circle at 94% 5%, #ff8f5a 0%, #ff8f5a00 30%),
        linear-gradient(180deg, #fff8e8 0%, #fff1d2 100%);
      color: #19130f;
      position: relative;
    }
    .wrap { padding: 74px 70px; height: 100%; display: grid; grid-template-rows: auto auto auto 1fr auto; gap: 18px; }
    .badge { justify-self: start; background:#19130f; color:#fff; padding:10px 18px; border-radius:999px; font-size:28px; font-weight:800; }
    .hook { margin: 0; font-size: 82px; line-height: 1.04; letter-spacing: -1px; font-weight: 900; }
    .subhook { margin: 0; font-size: 36px; line-height: 1.28; color:#38271c; font-weight: 500; }
    .phone { margin-top: 6px; justify-self:center; width: 760px; background:#1f1f1f; border-radius:52px; border:4px solid #262626; padding:16px; box-shadow:0 30px 48px #00000024; }
    .screen { background:#fff; border-radius:36px; padding:24px; display:grid; gap:14px; }
    .incoming { justify-self:start; max-width:84%; background:#ededed; border-radius:22px 22px 22px 8px; padding:16px 20px; font-size:27px; line-height:1.32; font-weight:500; }
    .reply { justify-self:end; max-width:86%; background:#ffe7cb; border:2px solid #ffbe8a; border-radius:22px 22px 8px 22px; padding:14px 18px; font-size:25px; line-height:1.3; font-weight:500; }
    .cta { justify-self:center; background:linear-gradient(180deg,#ff5d17 0%,#ff4d00 100%); color:#fff; padding:18px 28px; border-radius:22px; font-size:38px; font-weight:900; box-shadow:0 20px 34px #ff4d003d; }
  `;

  const body = `
  <div class="wrap">
    <div class="badge">SayBack</div>
    <h1 class="hook">${escapeHtml(post.hook)}</h1>
    <p class="subhook">${escapeHtml(post.subhook)}</p>
    <div class="phone">
      <div class="screen">
        <div class="incoming">${escapeHtml(post.sample_message)}</div>
        <div class="reply">${escapeHtml(post.sample_reply_1)}</div>
        <div class="reply">${escapeHtml(post.sample_reply_2)}</div>
        <div class="reply">${escapeHtml(post.sample_reply_3)}</div>
      </div>
    </div>
    <div class="cta">${escapeHtml(post.cta)}</div>
  </div>`;

  return pageShell(`SayBack Post ${post.id}`, body, styles);
};

const templateB = (post) => {
  const styles = `
    body {
      background:
        radial-gradient(circle at 14% 8%, #ffd40052 0%, transparent 38%),
        radial-gradient(circle at 92% 90%, #ff4d0038 0%, transparent 40%),
        linear-gradient(165deg, #1f140e 0%, #2a170d 42%, #391e0d 100%);
      color: #fff7ec;
      padding: 76px 72px;
    }
    .label { display:inline-block; background:#ffd400; color:#26170e; border-radius:999px; padding:10px 18px; font-size:28px; font-weight:800; margin-bottom:18px; }
    .hook { margin:0; font-size:76px; line-height:1.04; font-weight:900; letter-spacing:-1px; }
    .subhook { margin:14px 0 26px; font-size:34px; line-height:1.3; color:#ffd9c0; font-weight:500; }
    .proof { background:#ffffff14; border:1px solid #ffffff3b; border-radius:20px; padding:16px 18px; font-size:28px; line-height:1.34; font-weight:600; margin-bottom:18px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .reply { background:#fff7ef; color:#2a180f; border:2px solid #ffc499; border-radius:20px; padding:16px; font-size:24px; line-height:1.3; font-weight:500; min-height:124px; display:flex; align-items:center; }
    .msg { grid-column:1 / -1; background:#fff; color:#2a180f; border-radius:18px; padding:16px 18px; font-size:28px; line-height:1.3; font-weight:600; }
    .cta { margin-top:18px; text-align:center; background:linear-gradient(180deg,#ff5d17 0%,#ff4d00 100%); border-radius:22px; padding:18px 14px; font-size:38px; font-weight:900; color:#fff; }
  `;

  const body = `
  <div class="label">${escapeHtml(post.angle)}</div>
  <h1 class="hook">${escapeHtml(post.hook)}</h1>
  <p class="subhook">${escapeHtml(post.subhook)}</p>
  <p class="proof">${escapeHtml(post.proof)}</p>
  <div class="grid">
    <div class="msg">${escapeHtml(post.sample_message)}</div>
    <div class="reply">${escapeHtml(post.sample_reply_1)}</div>
    <div class="reply">${escapeHtml(post.sample_reply_2)}</div>
    <div class="reply" style="grid-column:1 / -1;">${escapeHtml(post.sample_reply_3)}</div>
  </div>
  <div class="cta">${escapeHtml(post.cta)}</div>
  `;

  return pageShell(`SayBack Post ${post.id}`, body, styles);
};

const templateC = (post) => {
  const styles = `
    body {
      background:
        radial-gradient(circle at 92% 12%, #ffd40061 0%, transparent 35%),
        radial-gradient(circle at 4% 88%, #ff4d0029 0%, transparent 38%),
        linear-gradient(180deg, #fff8e8 0%, #ffeecf 100%);
      color:#1a130f;
      padding:74px 68px;
    }
    .top { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:14px; }
    .hook { margin:0; font-size:74px; line-height:1.04; font-weight:900; letter-spacing:-1px; }
    .pill { background:#ff4d00; color:#fff; border-radius:999px; padding:10px 18px; font-size:26px; font-weight:800; white-space:nowrap; margin-top:8px; }
    .subhook { margin:0 0 16px; font-size:33px; line-height:1.3; color:#4a3428; font-weight:500; }
    .proof { margin:0 0 18px; font-size:28px; line-height:1.35; color:#2f2017; font-weight:600; background:#fff8ef; border:2px solid #ffcb9f; border-radius:18px; padding:14px 16px; }
    .stack { display:grid; gap:12px; }
    .bubble { background:#fff; border:2px solid #ebdfd0; border-radius:18px; padding:15px 16px; font-size:24px; line-height:1.3; font-weight:500; }
    .incoming { background:#f1f1f1; border-color:#e0e0e0; font-size:27px; font-weight:600; }
    .footer { margin-top:18px; background:#1a130f; color:#fff; border-radius:20px; padding:16px 18px; text-align:center; font-size:34px; line-height:1.25; font-weight:900; }
  `;

  const body = `
  <div class="top">
    <h1 class="hook">${escapeHtml(post.hook)}</h1>
    <div class="pill">${escapeHtml(post.angle)}</div>
  </div>
  <p class="subhook">${escapeHtml(post.subhook)}</p>
  <p class="proof">${escapeHtml(post.proof)}</p>
  <div class="stack">
    <div class="bubble incoming">${escapeHtml(post.sample_message)}</div>
    <div class="bubble">${escapeHtml(post.sample_reply_1)}</div>
    <div class="bubble">${escapeHtml(post.sample_reply_2)}</div>
    <div class="bubble">${escapeHtml(post.sample_reply_3)}</div>
  </div>
  <div class="footer">${escapeHtml(post.cta)}</div>
  `;

  return pageShell(`SayBack Post ${post.id}`, body, styles);
};

const templateD = (post) => {
  const styles = `
    body {
      background:
        radial-gradient(circle at 88% 5%, #ffd4004d 0%, transparent 34%),
        radial-gradient(circle at 12% 94%, #ff4d002f 0%, transparent 40%),
        linear-gradient(180deg, #15110f 0%, #24160e 60%, #2d180c 100%);
      color:#fff4e8;
      padding:74px 66px;
    }
    .hook { margin:0; font-size:80px; line-height:1.04; letter-spacing:-1px; font-weight:900; }
    .subhook { margin:14px 0 20px; font-size:35px; line-height:1.3; color:#ffd8c0; font-weight:500; }
    .message { background:#fff; color:#2a180f; border-radius:22px; padding:16px 18px; font-size:28px; line-height:1.3; font-weight:600; margin-bottom:14px; }
    .actions { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:16px; }
    .action { border-radius:16px; border:2px solid #ffffff45; background:#ffffff14; text-align:center; padding:12px 10px; font-size:28px; font-weight:800; }
    .action.main { background:linear-gradient(180deg,#ff5d17 0%,#ff4d00 100%); border-color:transparent; }
    .replies { display:grid; gap:10px; }
    .reply { background:#fff8ef; color:#2b180f; border:2px solid #ffc79f; border-radius:16px; padding:14px 16px; font-size:24px; line-height:1.3; font-weight:500; }
    .proof { margin-top:14px; font-size:30px; line-height:1.32; color:#ffe8d4; font-weight:700; }
  `;

  const body = `
  <h1 class="hook">${escapeHtml(post.hook)}</h1>
  <p class="subhook">${escapeHtml(post.subhook)}</p>
  <div class="message">${escapeHtml(post.sample_message)}</div>
  <div class="actions">
    <div class="action">עדין יותר</div>
    <div class="action main">חד יותר</div>
    <div class="action">נסה מחדש</div>
  </div>
  <div class="replies">
    <div class="reply">${escapeHtml(post.sample_reply_1)}</div>
    <div class="reply">${escapeHtml(post.sample_reply_2)}</div>
    <div class="reply">${escapeHtml(post.sample_reply_3)}</div>
  </div>
  <p class="proof">${escapeHtml(post.proof)}</p>
  `;

  return pageShell(`SayBack Post ${post.id}`, body, styles);
};

const templateE = (post) => {
  const styles = `
    body {
      background:
        radial-gradient(circle at 88% 12%, #ffd40080 0%, transparent 34%),
        radial-gradient(circle at 10% 96%, #ff4d0033 0%, transparent 38%),
        linear-gradient(165deg, #fff8e9 0%, #fff0d4 60%, #ffe6c1 100%);
      color:#1b130f;
      padding:76px 66px;
    }
    .badge { display:inline-block; background:#19130f; color:#fff; border-radius:999px; padding:9px 16px; font-size:26px; font-weight:800; margin-bottom:18px; }
    .hook { margin:0; font-size:78px; line-height:1.04; font-weight:900; letter-spacing:-1px; }
    .subhook { margin:12px 0 18px; font-size:34px; line-height:1.3; color:#4a3528; font-weight:500; }
    .proof { background:#19130f; color:#fff; border-radius:20px; padding:14px 16px; font-size:28px; line-height:1.3; font-weight:700; margin-bottom:16px; }
    .cards { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
    .card { background:#fff; border:2px solid #f2dcc4; border-radius:20px; padding:14px; min-height:154px; }
    .card .k { font-size:24px; color:#ff4d00; font-weight:800; margin-bottom:6px; }
    .card .t { font-size:23px; line-height:1.28; font-weight:500; color:#2f2017; }
    .cta { margin-top:6px; text-align:center; background:linear-gradient(180deg,#ff5d17 0%,#ff4d00 100%); color:#fff; border-radius:22px; font-size:38px; padding:16px 12px; font-weight:900; }
  `;

  const body = `
  <div class="badge">${escapeHtml(post.angle)}</div>
  <h1 class="hook">${escapeHtml(post.hook)}</h1>
  <p class="subhook">${escapeHtml(post.subhook)}</p>
  <div class="proof">${escapeHtml(post.proof)}</div>
  <div class="cards">
    <div class="card"><div class="k">הודעה נכנסת</div><div class="t">${escapeHtml(post.sample_message)}</div></div>
    <div class="card"><div class="k">תשובה 1</div><div class="t">${escapeHtml(post.sample_reply_1)}</div></div>
    <div class="card"><div class="k">תשובה 2</div><div class="t">${escapeHtml(post.sample_reply_2)}</div></div>
    <div class="card"><div class="k">תשובה 3</div><div class="t">${escapeHtml(post.sample_reply_3)}</div></div>
  </div>
  <div class="cta">${escapeHtml(post.cta)}</div>
  `;

  return pageShell(`SayBack Post ${post.id}`, body, styles);
};

const templates = [templateA, templateB, templateC, templateD, templateE];

for (const post of data) {
  if (!Number.isInteger(post.id) || post.id < 1) {
    throw new Error(`Invalid post id: ${post.id}`);
  }

  if (!post.hook || !post.subhook || !post.cta || !post.sample_message) {
    throw new Error(`Missing required field in post ${post.id}`);
  }

  const tpl = templates[(post.id - 1) % templates.length];
  const html = tpl(post);
  writeFileSync(resolve(ROOT, `post-${post.id}.html`), html, 'utf8');
}

console.log(`Generated ${data.length} post HTML files.`);
