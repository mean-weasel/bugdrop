# Privacy Policy

**Last updated:** February 2025

BugDrop is an open-source feedback widget that creates GitHub Issues with screenshots. This policy explains what data is collected and how it is used.

## What BugDrop Collects

When a user submits feedback through the BugDrop widget, the following data is collected:

- **Screenshot** — captured client-side only when the user initiates a submission
- **Feedback content** — the title, description, and category the user enters
- **Browser information** — browser name/version, operating system, viewport size, device pixel ratio, and language preference
- **Page URL** — the URL of the page where feedback was submitted (query parameters are redacted)
- **Name and email** — only if the site owner has enabled these optional fields and the user provides them

## What BugDrop Does NOT Collect

- No cookies are set by the widget
- No analytics or tracking scripts are included
- No data is sold or shared with third parties
- No personal data is stored by the BugDrop service itself

## Where Data Goes

All submitted feedback is sent to the **GitHub API** and created as a GitHub Issue in the repository configured by the site owner. Screenshots are stored in the repository's `.bugdrop/` directory. The BugDrop Cloudflare Worker acts only as a pass-through to authenticate with GitHub — it does not store any submitted data.

## Data Processing

BugDrop runs on **Cloudflare Workers**. Requests are processed in-memory and are not logged or persisted by the BugDrop service. Cloudflare's standard infrastructure policies apply to network-level processing.

## Self-Hosting

BugDrop is fully open source and self-hostable. If you run your own instance, you control all data processing. See [SELF_HOSTING.md](./SELF_HOSTING.md) for instructions.

## Contact

For privacy questions, open an issue at [github.com/mean-weasel/bugdrop](https://github.com/mean-weasel/bugdrop).
