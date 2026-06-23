# JH Comp Search

ATTOM-powered sold comp search tool for Jackson Hole / Teton County market intelligence.

## What it does
- Search sold SFR comps by lat/long radius, date range, price, sqft, beds
- Returns address, sale price, date, sqft, $/sqft, lot acres, beds, baths, year built
- Sortable table with summary stats (median price, avg price, avg $/sqft)
- Export to Google Sheets with one click

## Vercel environment variables
| Variable | Value |
|---|---|
| `ATTOM_API_KEY` | Your ATTOM API key |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `takeofftool@jh-takeoff-tool.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Full private key from service account JSON |
| `COMP_SHEET_ID` | Google Sheet ID for comp exports |

## Google Sheet setup
1. Create a new Google Sheet (or use an existing one)
2. Share it with `takeofftool@jh-takeoff-tool.iam.gserviceaccount.com` as Editor
3. Copy the Sheet ID from the URL and add as `COMP_SHEET_ID` env var
4. The app auto-creates a "Comps" tab with headers on first export

## Default search
Centers on Jackson WY (43.4799, -110.7624), 15-mile radius, SFR, $500k+, 2020–2025.
