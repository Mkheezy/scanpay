# Groundwork — Titanium Sequoia Master demo

Stakeholder presentation using the Titanium Sequoia visual system. Five guided chapters: opportunity, interactive guest payment, restaurant operations, business hypothesis, and a controlled pilot funding conversation. The original design-system explorer is retained at /design-reference.html.

## Deploy on Vercel

1. Import this Git repository into Vercel.
2. Select the `demo/titanium-sequoia-vercel` branch for the demo deployment (or make it the production branch).
3. Keep Root Directory at this folder, Framework Preset **Other**, Build Command **npm run build**, and Output Directory **dist**. These are also declared in vercel.json.
4. Deploy. No environment variables, database or payment credentials are needed for the visual demo.

See [Vercel Git deployments](https://vercel.com/docs/git) and [project configuration](https://vercel.com/docs/project-configuration).

## Files

- public/: deployed master presentation, interactions and demo information.
- scripts/build-demo.mjs: dependency-free static build.
- vercel.json: build settings and security headers.
- backend/: complete TypeScript backend, operational console, source SCSS, tests, Docker configuration, and local launcher.

## Run and check

Use Node 22. Run `npm run check` and `npm run build`. The generated dist directory is the complete deployable website.

For the persistent payment sandbox: `cd backend`, `npm ci`, then `npm start`. Open http://127.0.0.1:4310 and use Open working backend demo. `npm run check` in backend checks TypeScript and runs the 17 backend tests.

## Demo scope

The Vercel deployment is an interactive visual presentation. Menu orders, Apple Pay buttons, receipt status, POS confirmation, table tokens and merchant totals are illustrative. It does not process payments, collect card details, or connect to restaurant tills. Original font and photograph URLs require internet access.

The backend is included but is excluded from the static deployment. Its local PGlite storage and continuous worker are not configured as Vercel Functions. To publish its real sandbox separately, configure persistent PostgreSQL or a persistent local volume, the worker, APP_ORIGIN, and DEMO_ACCESS_KEY; see backend/docs and backend/.env.example. Do not upload .env, database contents or node_modules.

The supplied master had an unfinished JavaScript function and missing sample table controls. Those are repaired. Inline event handlers were moved to master.js to preserve a self-only script security policy. The visual design remains the supplied master.

## Presenting to stakeholders

Use the chapter navigation or Next button. In Experience, open the table bill, choose a share and tip, then simulate payment. Continue to the restaurant view and show the Till offline outcome. Finish with the pricing hypothesis and staged pilot ask. The readiness dialog distinguishes existing backend work from unvalidated integrations. No traction, investment amount or proven financial return is claimed.
