# Consent-based social proof workflow

This operator-only workflow turns the already-approved minimal installation records into a
private outreach list. It never sends messages, exposes a public endpoint, or authorizes public
display from an installation alone.

## Safety boundary

- Run these commands only on a trusted local machine.
- Keep the registry and candidate report outside the repository. Both files are created with
  owner-only permissions and will not overwrite an existing file. The command refuses paths inside
  the repository, including paths reached through a symlinked parent directory.
- Never commit the registry, candidate report, permission evidence, or installation identities.
- Do not add repository information, usage frequency, issue counts, email addresses, or other
  enrichment to this workflow.
- Contact an app owner at most once unless they reply. Record `contacted`, `declined`, `approved`,
  or `withdrawn` before regenerating the candidate report.
- Publishing requires affirmative permission from an authorized representative. Copy only the
  exact approved name, URL, logo URL, quote, and attribution into `publicProfile`.

## Create the private registry

```sh
npm run social-proof:consent -- init --output /private/path/bugdrop-consent.json
```

## Prepare an outreach list

Authenticate Wrangler with read access to the production Cloudflare KV namespace, then run:

```sh
npm run social-proof:consent -- prepare \
  --registry /private/path/bugdrop-consent.json \
  --exclude mean-weasel,neonwatty \
  --output /private/path/bugdrop-outreach.json
```

The terminal prints only the aggregate candidate count. Identifying values appear only in the
owner-only output file. The command rejects installation records with any fields beyond the
approved minimal schema. The exclusion list is required so owned and controlled test accounts
cannot accidentally enter the outreach queue.

## Record decisions

Non-approved entries contain exactly `installationId`, `status`, and `updatedAt`. For example:

```json
{
  "installationId": 123,
  "status": "declined",
  "updatedAt": "2026-08-30T00:00:00.000Z"
}
```

An approved entry also contains `approval`, including the approval date, a private evidence
reference, confirmation that the person was authorized, and the exact public profile they
approved. The validator rejects approvals without all of those safeguards.

## Export approved profiles

```sh
npm run social-proof:consent -- export-approved \
  --registry /private/path/bugdrop-consent.json \
  --output /private/path/bugdrop-approved-social-proof.json
```

This export contains only approved public profile fields. It omits installation IDs, private
evidence references, contact status, and all unapproved apps. Review the output against the
permission evidence before copying it into the website repository.
