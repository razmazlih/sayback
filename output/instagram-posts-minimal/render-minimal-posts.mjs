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
    }
    ${styles}
  </style>
</head>
<body>${body}</body>
</html>`;

const t1 = (p) => {
  const styles = `
    body {
      background: linear-gradient(155deg, #fff9ee 0%, #ffe8c6 100%);
      color: #17120f;
      padding: 78px 68px;
      position: relative;
    }
    .orb { position: absolute; width: 320px; height: 320px; left: -120px; top: 950px; border-radius: 50%; background: #ff4d0020; }
    .tag { display: inline-block; background: #17120f; color: #fff; border-radius: 999px; padding: 10px 18px; font-size: 26px; font-weight: 800; }
    .hook { margin: 24px 0 14px; font-size: 88px; line-height: 1.03; letter-spacing: -1px; font-weight: 900; max-width: 920px; }
    .sub { margin: 0 0 30px; font-size: 38px; line-height: 1.28; color: #3a2a1d; font-weight: 500; max-width: 910px; }
    .chat { background: #fff; border: 2px solid #f0dfc9; border-radius: 30px; padding: 24px; box-shadow: 0 14px 26px #00000012; display: grid; gap: 14px; }
    .msg { background: #efefef; border-radius: 20px; padding: 16px 18px; font-size: 32px; line-height: 1.28; font-weight: 600; }
    .reply { background: #ffe8cf; border: 2px solid #ffbc84; border-radius: 20px; padding: 16px 18px; font-size: 32px; line-height: 1.28; font-weight: 600; }
    .cta { margin-top: 24px; display: inline-block; background: linear-gradient(180deg,#ff5d17 0%,#ff4d00 100%); color: #fff; border-radius: 22px; padding: 18px 28px; font-size: 42px; font-weight: 900; }
  `;

  const body = `
    <div class="orb"></div>
    <div class="tag">${esc(p.angle)}</div>
    <h1 class="hook">${esc(p.hook)}</h1>
    <p class="sub">${esc(p.subhook)}</p>
    <div class="chat">
      <div class="msg">${esc(p.message)}</div>
      <div class="reply">${esc(p.reply)}</div>
    </div>
    <div class="cta">${esc(p.cta)}</div>
  `;

  return shell(`Minimal Post ${p.id}`, styles, body);
};

const t2 = (p) => {
  const styles = `
    body {
      background:
        radial-gradient(circle at 90% 10%, #ffd40055 0%, transparent 34%),
        linear-gradient(180deg, #14100e 0%, #26170d 100%);
      color: #fff5ea;
      padding: 80px 70px;
    }
    .label { display: inline-block; background: #ffd400; color: #20130a; border-radius: 999px; padding: 10px 18px; font-size: 26px; font-weight: 900; }
    .hook { margin: 24px 0 14px; font-size: 84px; line-height: 1.04; font-weight: 900; letter-spacing: -1px; }
    .sub { margin: 0 0 34px; font-size: 36px; color: #ffd9c1; line-height: 1.3; font-weight: 500; }
    .frame { border: 2px solid #ffffff38; border-radius: 28px; padding: 20px; background: #ffffff10; backdrop-filter: blur(4px); display: grid; gap: 14px; }
    .msg { background: #fff; color: #22160f; border-radius: 18px; padding: 14px 16px; font-size: 30px; line-height: 1.28; font-weight: 600; }
    .reply { background: #fff5ea; color: #22160f; border: 2px solid #ffc598; border-radius: 18px; padding: 14px 16px; font-size: 30px; line-height: 1.28; font-weight: 600; }
    .cta { margin-top: 26px; text-align: center; background: #fff; color: #1f130d; border-radius: 22px; padding: 18px 16px; font-size: 40px; font-weight: 900; }
  `;

  const body = `
    <div class="label">${esc(p.angle)}</div>
    <h1 class="hook">${esc(p.hook)}</h1>
    <p class="sub">${esc(p.subhook)}</p>
    <div class="frame">
      <div class="msg">${esc(p.message)}</div>
      <div class="reply">${esc(p.reply)}</div>
    </div>
    <div class="cta">${esc(p.cta)}</div>
  `;

  return shell(`Minimal Post ${p.id}`, styles, body);
};

const t3 = (p) => {
  const styles = `
    body {
      background: linear-gradient(180deg, #fff7e8 0%, #ffefcf 100%);
      color: #19130f;
      padding: 78px 66px;
    }
    .row { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .angle { background:#ff4d00; color:#fff; border-radius:999px; padding:10px 18px; font-size:25px; font-weight:900; }
    .hook { margin: 0; font-size: 78px; line-height: 1.03; font-weight: 900; letter-spacing: -1px; max-width: 700px; }
    .sub { margin: 18px 0 34px; font-size: 36px; line-height: 1.3; color: #463326; font-weight: 500; }
    .minimal { background:#17120f; color:#fff; border-radius:30px; padding:24px; display:grid; gap:14px; }
    .minimal .k { font-size:24px; opacity:0.84; font-weight:700; }
    .minimal .v { font-size:34px; line-height:1.26; font-weight:700; background:#ffffff15; border-radius:16px; padding:14px 16px; }
    .cta { margin-top: 24px; background: #ffd400; color: #1f130d; border-radius: 20px; padding: 18px 20px; font-size: 40px; font-weight: 900; text-align: center; }
  `;

  const body = `
    <div class="row">
      <div class="angle">${esc(p.angle)}</div>
      <h1 class="hook">${esc(p.hook)}</h1>
    </div>
    <p class="sub">${esc(p.subhook)}</p>
    <div class="minimal">
      <div class="k">הודעה נכנסת</div>
      <div class="v">${esc(p.message)}</div>
      <div class="k">תשובה מוכנה</div>
      <div class="v">${esc(p.reply)}</div>
    </div>
    <div class="cta">${esc(p.cta)}</div>
  `;

  return shell(`Minimal Post ${p.id}`, styles, body);
};

const t4 = (p) => {
  const styles = `
    body {
      background:
        radial-gradient(circle at 12% 14%, #ffd40066 0%, transparent 32%),
        radial-gradient(circle at 95% 90%, #ff4d0030 0%, transparent 35%),
        linear-gradient(165deg, #1a120d 0%, #2f1b0f 100%);
      color: #fff4e8;
      padding: 82px 72px;
    }
    .hook { margin:0; font-size:86px; line-height:1.04; letter-spacing:-1px; font-weight:900; }
    .sub { margin:16px 0 34px; font-size:35px; line-height:1.3; color:#ffd9c1; font-weight:500; }
    .split { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .box { background:#fff7ee; color:#22160f; border:2px solid #ffc599; border-radius:20px; padding:16px; min-height:240px; }
    .box .k { font-size:24px; color:#ff4d00; font-weight:900; margin-bottom:10px; }
    .box .v { font-size:32px; line-height:1.28; font-weight:700; }
    .cta { margin-top: 24px; background: linear-gradient(180deg,#ff5d17 0%,#ff4d00 100%); color:#fff; border-radius:22px; padding:18px 16px; text-align:center; font-size:40px; font-weight:900; }
    .angle { margin-top:16px; font-size:26px; font-weight:800; color:#ffd400; }
  `;

  const body = `
    <h1 class="hook">${esc(p.hook)}</h1>
    <p class="sub">${esc(p.subhook)}</p>
    <div class="split">
      <div class="box"><div class="k">נכנס</div><div class="v">${esc(p.message)}</div></div>
      <div class="box"><div class="k">שולחים</div><div class="v">${esc(p.reply)}</div></div>
    </div>
    <div class="cta">${esc(p.cta)}</div>
    <div class="angle">${esc(p.angle)}</div>
  `;

  return shell(`Minimal Post ${p.id}`, styles, body);
};

const t5 = (p) => {
  const styles = `
    body {
      background: linear-gradient(145deg, #fff8ec 0%, #ffe8c8 100%);
      color:#19130f;
      padding:76px 64px;
      position:relative;
    }
    .dot { position:absolute; width:150px; height:150px; border-radius:50%; background:#ffd4007a; right:40px; top:38px; }
    .dot2 { position:absolute; width:210px; height:210px; border-radius:50%; background:#ff4d0020; left:-70px; bottom:110px; }
    .angle { display:inline-block; background:#19130f; color:#fff; border-radius:999px; padding:9px 16px; font-size:24px; font-weight:800; position:relative; z-index:2; }
    .hook { margin:20px 0 14px; font-size:82px; line-height:1.04; font-weight:900; letter-spacing:-1px; max-width:900px; position:relative; z-index:2; }
    .sub { margin:0 0 28px; font-size:35px; line-height:1.3; color:#453225; font-weight:500; position:relative; z-index:2; }
    .single { background:#fff; border:2px solid #ecdcc7; border-radius:24px; padding:20px; box-shadow:0 12px 22px #00000012; position:relative; z-index:2; }
    .single .msg { font-size:30px; line-height:1.28; font-weight:600; background:#efefef; border-radius:16px; padding:12px 14px; margin-bottom:12px; }
    .single .reply { font-size:30px; line-height:1.28; font-weight:600; background:#ffe8cf; border:2px solid #ffbc84; border-radius:16px; padding:12px 14px; }
    .cta { margin-top:22px; display:block; width:100%; text-align:center; background:#17120f; color:#fff; border-radius:20px; padding:18px 14px; font-size:38px; font-weight:900; position:relative; z-index:2; }
  `;

  const body = `
    <div class="dot"></div><div class="dot2"></div>
    <div class="angle">${esc(p.angle)}</div>
    <h1 class="hook">${esc(p.hook)}</h1>
    <p class="sub">${esc(p.subhook)}</p>
    <div class="single">
      <div class="msg">${esc(p.message)}</div>
      <div class="reply">${esc(p.reply)}</div>
    </div>
    <div class="cta">${esc(p.cta)}</div>
  `;

  return shell(`Minimal Post ${p.id}`, styles, body);
};

const templates = [t1, t2, t3, t4, t5];

for (const p of posts) {
  const template = templates[(p.id - 1) % templates.length];
  writeFileSync(resolve(ROOT, `minimal-post-${p.id}.html`), template(p), 'utf8');
}

console.log(`Generated ${posts.length} minimal post HTML files.`);
