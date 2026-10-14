# Security

Found a vulnerability? Please email websitebuilds01@gmail.com with the details and give us a reasonable time to fix it before sharing it publicly.
Please do not test against real customers' data or run denial-of-service tests.

Secrets live only in Cloudflare environment secrets (`PEPPER`, `ADMIN_CODE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, optional `ADMIN_TOTP`) and are never committed.
