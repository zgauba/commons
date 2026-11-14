# Pets admin feedback + Haq al Laila tagline: review note (2026-11-14)

**Tier:** cosmetic (copy + layout). No reviewer agent, per tiered verification. Source: Zee's phone screenshots, 2026-11-14.

## What changed

| Zee's feedback | Change |
|---|---|
| The WhatsApp group row touches Add an Animal | 12px between the settings row and the button |
| "Community animals" isn't a thing; it's strays | "Strays" everywhere it said "strays and community animals": group heading, empty state, editor title and help, the Admins screen's Pets level, the admin log label (EN + AR) |
| Admins can't add a household's pet, so the button should say so | **Add a Stray** (EN + AR) |
| A care item's date box runs past the card on the phone | iOS Safari gives date inputs their own minimum width; it is reset (`appearance: none`, `min-width: 0`, `max-width: 100%`) |
| Haq al Laila: the Arabic and English taglines on one line | The English meaning on the left, the Arabic on the right, on one line; it wraps only if a phone is too narrow. Arabic-only in Arabic, as before. |

## Checks

- Tests updated for the new words.
- New: the event header test checks that the two taglines share a line and the English comes first.
- Local Chromium mobile (admin-pets, admin-households, looks-pins, events, a11y): **196 passed**. Full suite in both browsers: CI.
- The date-width fix is WebKit-specific. I checked it in CI's WebKit lane, and Zee should check it on his phone after deploy.
