# Public WhatsApp screenshot verification

Checked on 2026-11-15 through https://sayback.vercel.app, running release `51005ab`. These checks used publicly published WhatsApp captures rather than generated HTML conversation fixtures. Files were downloaded as published and were not edited for testing. Publisher claims and visible app UI are provenance evidence, not independent proof that a conversation is authentic or unaltered.

## Live browser results

All seven uploads used real anonymous Firebase authentication and the production `/api/generate` route. Each returned HTTP 200, one intent and three replies, which were checked against the displayed screenshot and rendered in the UI. No browser page errors occurred. Requests took about 5.5–9.5 seconds including response rendering and the saved browser screenshot.

| Published capture | Visible scenario | Observed interpretation |
| --- | --- | --- |
| Walla Hebrew iPhone dark mode | Full phone chrome and Hebrew keyboard; last bubble outgoing | Identified no new incoming reply; did not treat keyboard as conversation |
| SG Studio Hebrew testimonial | Dense long paragraph, three bubbles, cropped view | Correctly treated the phone owner as the designer who had already thanked the client |
| Uzliwood customer capture | Photo grid, incoming thanks, outgoing voice note and large sticker | Recognized the outgoing voice note; suggested follow-ups without inventing its audio content |
| Wikimedia Android dark mode | Eight English message bubbles, incoming final farewell | Responded to the other participant's farewell in Hebrew without reversing roles |
| Zerem Academy student capture | Full iPhone frame, long technical/pricing message plus five outgoing replies | Preserved the instructor as phone owner and followed up on the last unanswered question; did not claim the student's project as the owner's |
| Zerem Academy quoted-reply capture | Quoted previous message, Yesterday/Today separators and publisher annotation | Did not treat the quoted preview as a new message; recognized that thanks had already been sent |
| Zerem Academy dense incoming praise | Two long bubbles, link and mixed Hebrew/English text | Responded as the course creator to the student's latest praise |

These outcomes address speaker identification, latest-message selection and conversation content in this small sample. They do not establish universal accuracy. Wording still varies: some replies infer grammatical gender or use unnecessary follow-up pressure despite neutral defaults and no confirmed elapsed time. No product-code changes were made during this verification.

## Sources

- Walla: https://tech.walla.co.il/item/3402496 — published Hebrew dark-mode screenshot, credited as PR imagery. The example conversation may have been staged by the publisher.
- SG Studio: https://sg-studio.co.il/ — published customer testimonial image (`שירלי המלצות 5`).
- Uzliwood: https://www.uzliwood.co.il/items/7925107 — published customer chat, with publisher-obscured header/sticker.
- Wikimedia Commons: https://commons.wikimedia.org/wiki/File:WhatsApp_Chatting_with_Dark_Mode.jpg — VincentLR's uploaded Android capture, described as own work (CC BY-SA 4.0).
- Zerem Academy: https://zacademy.co.il/proofs/ — publisher states these are screenshots from their phone, with names blurred. Tested originals: `תלמיד-מוצלח.png`, `המלצה-2.webp`, `המלצה-18.webp` under `/wp-content/uploads/2026/01/`.

Raw downloaded images and live responses are local-only under `output/playwright/real-whatsapp/`, including `live-verification.json` (four cases) and `live-long-verification.json` (three cases). They are excluded from Git; source images are not redistributed in the repository.

## Remaining coverage

A dense message or a six-bubble screen is not a very long stitched/scrolling screenshot. No suitable original public long-scroll capture was located, so that case remains unverified. Publisher crops, redactions and annotations also mean these are not a clean sample of untouched original phone files. A user-provided original long-scroll screenshot is needed to complete that check without manufacturing an example. The extractor currently takes at most 12 recent visible bubbles; off-screen conversation history is unavailable.

No physical phone or private WhatsApp account was accessed. No changes were deployed for this testing-only task.
