# Full-screen screenshot verification

Checked locally on 2026-11-15 using the configured `gpt-5.6-luna` model and synthetic Hebrew conversation images. No personal conversations were used.

## Implementation

Image requests now use two sequential model calls. High-detail vision extracts at most 12 recent bubbles with explicit `user` (phone owner) and `other` speaker labels. Runtime validation rejects unreadable or malformed transcripts. The existing reply generator receives text only, including the ordered transcript and the actual target message. An outgoing final bubble selects follow-up behavior without inventing elapsed time; pasted incoming text takes precedence when supplied.

The public result remains one `intent` and exactly three `replies`. No image or transcript persistence was added. Extraction failures reach the existing generation-error/refund path. Local rule-based mode returns an explicit Hebrew error for images.

Prompt-only changes still reversed sender and recipient in the outgoing-last fixture after removing example-specific wording. Separating extraction from reply generation addressed this in the tested fixtures, at the cost of an extra model call per screenshot request, including refinements.

## Final live-model checks

Each fixture was run three times through the real generation engine and reviewed for the original failure conditions:

| Fixture | Observed result | Runs |
| --- | --- | --- |
| Full screen, header and status bar | Answers the other person's format question as the phone owner | 3/3 |
| Full screen with keyboard and unsent `שלח PDF` draft | Does not treat keyboard/draft as an incoming message or reverse speakers | 3/3 |
| Last visible message is our already-sent `אקסל בבקשה, תודה!` | Offers follow-ups requesting the file; does not claim we sent the file or switch the established format | 3/3 |
| Cropped conversation control | Identifies and answers the incoming question | 3/3 |

All 12 returned the expected API result shape. Final engine call times were approximately 2.9–5.3 seconds for these fixtures. This is a small scenario check, not an accuracy estimate across messaging apps. Wording quality and grammatical neutrality can still vary.

## Automated checks

- `npm run lint`, `npm run typecheck`, and `npm run build` passed. Build required execution outside the sandbox because Turbopack opens an internal port.
- `npm test`: 182 passed, including extraction sequencing, sender chronology, explicit pasted-message priority, malformed/unreadable transcripts, upstream errors and local-mode image rejection.
- Existing browser compression verification passed: a 14.7 MB synthetic PNG was reduced below the request budget; small supported originals were preserved, with cancellation and invalid-image handling checked.

## Reproduction and scope

Run `node --env-file=.env.local scripts/verify-screenshot-understanding.mjs` with Playwright available. `SAYBACK_PLAYWRIGHT_MODULE` can point to its module entry file. The script writes synthetic images and raw results under `output/playwright/`; inspect replies manually because the script checks structure rather than semantic correctness. It incurs model usage. `SAYBACK_SCREENSHOT_REPEATS=1` runs one iteration per fixture.

This verification did not include a physical phone, production deployment, authenticated browser-to-billing flow or real Stripe payments. Dense long screenshots, hidden/cut-off text, other messaging-app layouts and ambiguous sender cues remain limitations; a safe error is preferable to invented content. Two calls can also take longer for difficult images or slow upstream responses.
