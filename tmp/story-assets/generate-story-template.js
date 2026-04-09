const fs = require('fs');
const path = require('path');

const slides = [
  {
    id: 1,
    kicker: 'SayBack',
    title: 'מה לענות בלי להיתקע?',
    subtitle: 'מעלים הודעה ומקבלים 3 תשובות טבעיות בעברית תוך שניות.',
    chips: ['וואטסאפ', 'אינסטגרם', 'לקוחות', 'דייטינג'],
    cta: 'נסו עכשיו בחינם',
    accent: '#ff4d00',
    accentSoft: '#ffd8c7',
    cardTone: 'gradient-a',
  },
  {
    id: 2,
    kicker: 'הודעה נכנסת',
    title: 'לקוח ביקש הנחה?',
    subtitle: 'SayBack שומר על מקצועיות ונותן 3 ניסוחים שאפשר להעתיק מיד.',
    chips: ['טון עדין', 'טון ישיר', 'טון זורם'],
    cta: 'העתק-הדבק וסגרת עסקה',
    accent: '#0f766e',
    accentSoft: '#c6f7ee',
    cardTone: 'gradient-b',
  },
  {
    id: 3,
    kicker: 'למה זה עובד',
    title: 'במקום לחשוב 10 דקות',
    subtitle: '3 תשובות קצרות. בוחרים אחת, שולחים, וממשיכים את היום.',
    chips: ['מהיר', 'טבעי', 'בלי מבוכה'],
    cta: 'פחות התלבטות. יותר תוצאות.',
    accent: '#7c3aed',
    accentSoft: '#e8ddff',
    cardTone: 'gradient-c',
  },
  {
    id: 4,
    kicker: 'התאמה אישית',
    title: 'קראש, אקס, בוס או יד2',
    subtitle: 'בוחרים סיטואציה וטון, ו-SayBack מתאים את התשובות בדיוק לשיחה שלך.',
    chips: ['עדין', 'מצחיק', 'פלרטטני', 'ישיר'],
    cta: 'תנו לשיחה לעבוד בשבילכם',
    accent: '#ca8a04',
    accentSoft: '#fff4c2',
    cardTone: 'gradient-d',
  },
  {
    id: 5,
    kicker: 'התחלה חינם',
    title: '3 שימושים ראשונים מתנה',
    subtitle: 'מתחילים חינם, ואז ממשיכים בקרדיטים או ללא הגבלה חודשי.',
    chips: ['3 תשובות בכל שימוש', 'תשלום מאובטח', 'עברית מלאה'],
    cta: 'שלחו סטורי עם לינק והביאו לקוחות חדשים',
    accent: '#dc2626',
    accentSoft: '#ffd7d7',
    cardTone: 'gradient-e',
  },
];

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SayBack Story Studio</title>
  <style>
    :root {
      --bg-main: #fff7e6;
      --ink: #19130f;
      --surface: #fffdf8;
      --accent: #ff4d00;
      --accent-soft: #ffd8c7;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 1080px;
      height: 1920px;
      overflow: hidden;
      font-family: "Rubik", "Heebo", "Noto Sans Hebrew", "Arial", sans-serif;
      background: var(--bg-main);
      color: var(--ink);
    }
    body {
      position: relative;
      padding: 72px;
      display: flex;
      align-items: stretch;
      justify-content: stretch;
      background-image:
        radial-gradient(circle at 8% 10%, #ffe38a 0%, transparent 36%),
        radial-gradient(circle at 92% 5%, #ff8f5a 0%, transparent 30%),
        linear-gradient(180deg, #fff8e8 0%, #fff4db 100%);
    }
    .noise {
      position: absolute;
      inset: 0;
      opacity: 0.15;
      background-image: radial-gradient(rgba(0,0,0,0.2) 0.6px, transparent 0.6px);
      background-size: 4px 4px;
      pointer-events: none;
      mix-blend-mode: multiply;
    }
    .wrapper {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 54px;
      border: 4px solid #111111;
      background: var(--surface);
      box-shadow: 0 26px 0 #111111;
      padding: 56px 54px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      isolation: isolate;
    }
    .blob {
      position: absolute;
      border-radius: 999px;
      filter: blur(0.2px);
      z-index: -1;
      opacity: 0.9;
    }
    .blob.one {
      width: 460px;
      height: 460px;
      top: -120px;
      left: -70px;
      background: color-mix(in srgb, var(--accent) 22%, white);
    }
    .blob.two {
      width: 380px;
      height: 380px;
      bottom: -120px;
      right: -120px;
      background: color-mix(in srgb, var(--accent) 14%, #ffefad);
    }
    .brand-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
    }
    .brand {
      padding: 10px 18px;
      border: 3px solid #111;
      border-radius: 999px;
      background: #f7ff4f;
      font-weight: 800;
      font-size: 30px;
      line-height: 1;
    }
    .kicker {
      padding: 10px 18px;
      border: 3px solid #111;
      border-radius: 999px;
      font-weight: 800;
      font-size: 28px;
      line-height: 1;
      background: var(--accent-soft);
    }
    .main {
      margin-top: 36px;
      display: grid;
      gap: 24px;
    }
    h1 {
      margin: 0;
      font-size: 92px;
      line-height: 0.95;
      letter-spacing: -1.8px;
      font-weight: 900;
    }
    .subtitle {
      margin: 0;
      font-size: 43px;
      line-height: 1.32;
      font-weight: 650;
      color: #2d241d;
      max-width: 92%;
    }
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 8px;
    }
    .chip {
      border: 3px solid #111;
      border-radius: 999px;
      padding: 11px 20px;
      background: white;
      font-size: 30px;
      font-weight: 750;
      box-shadow: 0 7px 0 #111;
    }
    .reply-mock {
      margin-top: 8px;
      padding: 24px;
      border: 3px solid #111;
      border-radius: 32px;
      background: linear-gradient(145deg, #fff, #fff9ef);
      box-shadow: 0 13px 0 #111;
      display: grid;
      gap: 14px;
    }
    .reply-line {
      border: 2.5px solid #111;
      border-radius: 16px;
      padding: 16px 18px;
      font-size: 30px;
      font-weight: 700;
      background: #ffffff;
    }
    .reply-line:nth-child(1) { background: color-mix(in srgb, var(--accent-soft) 55%, white); }
    .reply-line:nth-child(2) { background: #fff7d7; }
    .reply-line:nth-child(3) { background: #dff8ff; }
    .footer {
      margin-top: 34px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
    }
    .cta {
      border: 4px solid #111;
      border-radius: 24px;
      background: var(--accent);
      color: white;
      font-size: 42px;
      font-weight: 850;
      padding: 20px 26px;
      line-height: 1.1;
      box-shadow: 0 12px 0 #111;
      max-width: 78%;
    }
    .serial {
      font-size: 24px;
      font-weight: 750;
      border: 2px solid #111;
      border-radius: 14px;
      padding: 8px 12px;
      background: #fff;
    }
    .gradient-a { background: linear-gradient(125deg, #fffdf8 0%, #fff6d5 52%, #ffe8da 100%); }
    .gradient-b { background: linear-gradient(125deg, #fffdf8 0%, #defaf5 52%, #ecfff3 100%); }
    .gradient-c { background: linear-gradient(125deg, #fffdf8 0%, #efe7ff 50%, #f8eefe 100%); }
    .gradient-d { background: linear-gradient(125deg, #fffdf8 0%, #fff2c8 52%, #ffeac2 100%); }
    .gradient-e { background: linear-gradient(125deg, #fffdf8 0%, #ffe0d9 52%, #ffe8de 100%); }
  </style>
</head>
<body>
  <div class="noise"></div>
  <div class="wrapper" id="slide-card">
    <div class="blob one"></div>
    <div class="blob two"></div>

    <section>
      <div class="brand-row">
        <div class="brand" id="brand">SayBack</div>
        <div class="kicker" id="kicker"></div>
      </div>

      <div class="main">
        <h1 id="title"></h1>
        <p class="subtitle" id="subtitle"></p>

        <div class="chip-row" id="chips"></div>

        <div class="reply-mock">
          <div class="reply-line">אפשרות 1: ניסוח טבעי וקצר</div>
          <div class="reply-line">אפשרות 2: טון חד וברור</div>
          <div class="reply-line">אפשרות 3: יותר זורם לשיחה</div>
        </div>
      </div>
    </section>

    <section class="footer">
      <div class="cta" id="cta"></div>
      <div class="serial" id="serial"></div>
    </section>
  </div>

  <script>
    const slides = ${JSON.stringify(slides, null, 2)};
    const params = new URLSearchParams(window.location.search);
    const id = Number.parseInt(params.get('slide') || '1', 10);
    const data = slides.find((item) => item.id === id) || slides[0];

    document.documentElement.style.setProperty('--accent', data.accent);
    document.documentElement.style.setProperty('--accent-soft', data.accentSoft);

    const card = document.getElementById('slide-card');
    card.classList.add(data.cardTone);

    document.getElementById('kicker').textContent = data.kicker;
    document.getElementById('title').textContent = data.title;
    document.getElementById('subtitle').textContent = data.subtitle;
    document.getElementById('cta').textContent = data.cta;
    document.getElementById('serial').textContent = `סטורי ${data.id}/5`;

    const chipsContainer = document.getElementById('chips');
    for (const chip of data.chips) {
      const el = document.createElement('div');
      el.className = 'chip';
      el.textContent = chip;
      chipsContainer.appendChild(el);
    }
  </script>
</body>
</html>`;

const outputPath = path.resolve(process.cwd(), 'tmp/story-assets/stories-template.html');
fs.writeFileSync(outputPath, html, 'utf8');
console.log(outputPath);
