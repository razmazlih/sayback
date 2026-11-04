# Private visitor insights

`/insights` displays aggregate data from the existing Firestore `product_events` collection. No new paid service, analytics subscription, database migration or credentials are required by this code. Reads use the existing Firestore project and its existing quotas: each refresh reads at most 1,001 events. This is not a promise of unlimited free usage.

## Private access (not enabled by this change)

The API rejects everyone unless a server-only allowlist explicitly authorizes them: `ANALYTICS_VIEWER_UIDS` contains an exact Firebase Authentication UID, or `ANALYTICS_VIEWER_EMAILS` contains an exact email address. Email access additionally requires a verified token email and a current, enabled Firebase account with the same verified email and UID. Anonymous accounts are always rejected. Tokens are verified with revocation checking. Wildcards, display names, Vercel user IDs, guessed UIDs, client variables, public admin routes and shared keys are not accepted.

After the owner confirms the intended SayBack account, an authorized project administrator can set its verified email in `ANALYTICS_VIEWER_EMAILS`, or verify its UID in Firebase Authentication and set it in `ANALYTICS_VIEWER_UIDS`, for the intended production environment, and redeploy. This grants read access to this aggregate report only. It does not enable `/admin` or modify Firebase roles/rules. Removing its entries from both allowlists and redeploying revokes report access. No access list or environment variable has been changed by this implementation.

Sign in through SayBack's existing account flow, then open `/insights` in the same browser. The page distinguishes missing permission, expired sign-in, unavailable storage, empty results and partial samples. The report is excluded from indexing, and direct visits do not initialize third-party telemetry.

## What the numbers mean

- 7 or 30 UTC calendar days, including today up to the refresh time.
- Visitors: distinct browser visitor IDs on recorded home page views, with Firebase UID fallback. This estimates devices/identities, not people. Authentication/storage blockers can undercount.
- Page views: recorded home mounts after anonymous/authenticated identity is ready. Other pages are not included.
- Generations: server-confirmed `generation_success`, including refinements.
- Copies: successful clipboard actions. Copy all counts as one action, and share-to-clipboard counts as one. Native sharing and failed copying do not count. Copying does not imply sending.
- Returning identities: identities marked as returning on events in the range, first active on an earlier UTC date. Historical flags are not rewritten.
- Sources: fixed buckets from **first-touch UTM**. No raw campaign values are returned. Untagged links are direct/unknown; this is not automatic referrer attribution.
- The report reads the newest 1,000 events with a sentinel for truncation. A visible warning appears if the selected period exceeds that cap. Counts in that case are partial, not period totals. Daily unique counts and source counts are not additive unique people.

Example campaign links: `https://sayback.vercel.app/?utm_source=instagram&utm_medium=organic&utm_campaign=launch` and the same URL with `utm_source=tiktok` or `facebook`. Never put personal information or message contents into UTM parameters.

## Privacy and operations

Only aggregate counts, fixed source labels and dates leave `/api/insights`. No UID, visitor/session ID, email, raw event metadata or message text is returned. Private responses use `no-store`, `Vary: Authorization` and `nosniff`. The existing local-only admin remains production-disabled. No new content recording is added.

Vercel Web Analytics is a separate provider. The SDK was already installed; it now removes URL queries/fragments and excludes private paths. The connector returned `Web Analytics not found` during implementation. No Vercel plan was enabled or purchased. The connector denied environment-variable listing and creation of the explicitly approved production viewer email setting (403), so private viewing could not be enabled. Existing provider settings were not changed. Enabling Vercel Analytics requires the project dashboard Analytics > Enable; available tools do not expose this activation. After enabling it, redeploy so the Vercel collection routes are included. Do not select a paid plan/add-on without approval.

Validation: `npm run test:insights` covers aggregation, privacy, authorization, bounded reads, availability, return classification and successful/failed copy actions. The normal `npm run check` includes these tests.
