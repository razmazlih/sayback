# SayBack visual walkthrough

[Back to project overview](../README.md) · [Open the live app](https://sayback.vercel.app)

These are real browser captures of the compact reply-direction UI on **November 6,
2026**. They use a locally running app and synthetic services. They illustrate the
interaction and layout, rather than live AI quality or payment integration.

## 1. Add a message and choose directions

The sample incoming message is “היי, מתאים לך שנדבר בערב?” (Can we talk tonight?).
Six compact controls cover tone, context, goal, language, conversation continuation,
and background. Only one inline editor opens at a time. Here the tone editor is
expanded so its choices are easy to see; selecting a tone closes it and returns focus.

<img src="screenshots/reply-directions-mobile.png" alt="Populated mobile composer with expanded tone choices" width="360">

Single-choice fields close after selection. Language and background stay open until
**סיימתי**, Escape, or another field is selected. Each direction has a clear action;
clearing tone restores **זורם**. Direction edits do not consume a use. Some choices
require monthly access; buying credits does not unlock monthly features.

## 2. Compare three replies

An explicit generation request shows one short interpretation and exactly three
reply cards. These fixture replies all answer the same sample invitation. Copy a
reply, soften it, sharpen it, or try another wording. SayBack does not send it.

<img src="screenshots/reply-results-mobile.png" alt="Three synthetic replies to the sample invitation, with copy and refinement controls" width="360">

## 3. Use the desktop workspace

The desktop view keeps the populated composer, expanded editor, and reply cards
side by side. Changing request details marks existing replies as outdated; refining
an existing result uses that result's original request.

![Updated desktop workspace with sample input, expanded tone choices and three synthetic replies](screenshots/reply-directions-desktop.png)

## Capture notes

- **Source:** local Next.js app at `http://127.0.0.1:3100`, based on PR #20 plus the documentation conflict resolution.
- **Capture date:** 2026-11-06 UTC.
- **Input:** synthetic invitation quoted above; default **זורם** tone, no saved person or private conversation.
- **Method:** `scripts/verify-conversation-experience.mjs` captures the running UI after sample entry and a mocked generation. The editor is opened after generation without changing its selection. Screenshots are not fabricated or composited.
- **Typography:** the local server uses the Rubik font from the official Google Fonts GitHub repository through a local font response fixture because Google Fonts is unavailable in this environment. No application styling was changed.
- **Services:** Firebase authentication and application APIs, including billing and generation, are intercepted with synthetic responses; other external browser traffic is blocked. No live AI response, Firebase write, Stripe charge, or webhook delivery is verified.
- **Privacy:** no personal messages, actual names, account email addresses, payment details, or private account screens appear in these captures.
- **UI verification:** RTL and overflow, exactly three reply cards, compact editor choices, clearing, focus/Escape, access restrictions, payloads, stale results, and refinement context are covered by the browser runner.
- **Not covered:** live image understanding, account linking, persistence, paid checkout, or webhook reconciliation. See [development and verification](development.md).

The older `01-compose.jpg`, `02-style.jpg`, and `03-replies.jpg` files are retained
as historical live-site captures. They predate the compact controls and are no
longer used to present the current workflow. Earlier live-generation provenance
applies only to those historical images, not to the new fixture captures.
