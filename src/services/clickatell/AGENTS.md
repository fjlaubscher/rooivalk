# ClickatellService Agent Guidelines

## Overview

`ClickatellService` sends SMS messages via Clickatell's simple HTTP send endpoint. It is exposed to the chat models through the `SEND_SMS` tool and executed by `RooivalkService`.

## Endpoint

```
GET https://platform.clickatell.com/messages/http/send
  ?apiKey={CLICKATELL_API_KEY}
  &to={international_number_without_plus}
  &content={url_encoded_text}
```

The `URL`/`URLSearchParams` API handles encoding — do not hand-roll query strings.

## Recipient Format

- International format, digits only (no `+`, spaces, or dashes).
- The service strips a leading `+` and whitespace/dashes defensively, then validates `^\d{6,15}$`.

## Configuration

- `CLICKATELL_API_KEY` — required for the tool to function. If unset, `isConfigured` returns `false` and the executor reports a friendly error rather than calling out.

Recipient allowlisting is owned by `MemoryService` (the SQLite `phone_numbers` table). `RooivalkService` resolves the recipient's phone number by Discord user ID before calling `sendSms`; users self-register via the `register_phone_number` tool.

## Common Tasks

| Task                   | Action                                  | Notes                               |
| ---------------------- | --------------------------------------- | ----------------------------------- |
| Switch to One API REST | Replace `sendSms` body with POST + JSON | Keep public signature stable        |
| Add allowlist          | Filter `to` against env var             | Prevents abuse if scope changes     |
| Add delivery receipts  | Parse `body` / poll status endpoint     | Currently returns raw response text |

## Testing

- Unit tests in `index.test.ts`. Mock `global.fetch`.
- Cover: happy path, recipient normalization, missing key, invalid recipient, empty content, non-OK response.
