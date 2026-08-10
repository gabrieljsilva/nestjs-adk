---
"@nestjs-adk/google": minor
---

Gemini declares `MEDIA_URL`, because the premise for not declaring it expired in January 2026.

`fileUri` used to take only Google's own Files API, so a remote link handed to Gemini was a string nobody fetched. Since January 2026 the API fetches files from public HTTPS addresses and from signed URLs (S3 pre-signed and Azure SAS named explicitly), and the request mapper already sends a remote part exactly that way. With the capability declared, `SignedUrlAttachmentResolver` now mints a fresh address for a turn Gemini serves instead of replacing the image with a note giving a reason that stopped being the reason.

One reliability note: `googleapis/js-genai#1385` reports intermittent "Cannot fetch content from the provided URL" for S3 pre-signed URIs, where the URL stays valid and a retry succeeds. An application running signed URLs against Gemini should expect to retry that failure.
