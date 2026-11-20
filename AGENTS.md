# Otolaryn project rules

## Production platform

- This application is hosted on the Mederi VPS. Never use Vercel for this project, including deployments, previews, builds, configuration, dashboard or API access, and production URLs.
- Deploy and verify production only on the VPS. The application URL is https://app.medericloud.com and the API URL is https://api.medericloud.com.
- Treat the VPS services `mederi-backend.service` and `mederi-frontend.service` as the production services. Vercel status is never evidence of a production deployment.
- GitHub pushes may still trigger an existing automatic Vercel integration. Do not rely on or interact with that integration; use the VPS release procedure for production.
