# Groundwork — Titanium Sequoia Master demo

Stakeholder presentation using the Titanium Sequoia visual system. Five guided chapters: opportunity, interactive guest payment, restaurant operations, business hypothesis, and a controlled pilot funding conversation. Design-system source files are archived under `docs/design-reference/` and are excluded from the website. Old reference-page URLs redirect to the presentation.

## Deploy on Vercel

1. Import this Git repository into Vercel.
2. Select the `demo/titanium-sequoia-vercel` branch for the demo deployment (or make it the production branch).
3. Keep Root Directory at this folder, Framework Preset **Other**, Build Command **npm run build**, and Output Directory **dist**. These are also declared in vercel.json.
4. Deploy. No environment variables, database or payment credentials are needed for the visual demo.

See [Vercel Git deployments](https://vercel.com/docs/git) and [project configuration](https://vercel.com/docs/project-configuration).

## Files

- public/: stakeholder presentation and ordering interactions.
- scripts/build-demo.mjs: dependency-free static build.
- vercel.json: build settings and security headers.
- backend/: complete TypeScript backend, operational console, source SCSS, tests, Docker configuration, and local launcher.

## Run and check

Use Node 22. Run `npm run check` and `npm run build`. The generated dist directory is the complete deployable website.

For the persistent payment sandbox: `cd backend`, `npm ci`, then `npm start`. Open http://127.0.0.1:4310 for the presentation, or http://127.0.0.1:4310/sandbox.html#demo for the payment test console. `npm run check` in backend checks TypeScript and runs the 18 backend tests.

## Demo scope

The Vercel deployment is an interactive visual presentation. Menu orders, Apple Pay buttons, receipt status, POS confirmation, table tokens and merchant totals are illustrative. It does not process payments, collect card details, or connect to restaurant tills. Original font and photograph URLs require internet access.

The backend is included but is excluded from the static deployment. Its local PGlite storage and continuous worker are not configured as Vercel Functions. To publish its real sandbox separately, configure persistent PostgreSQL or a persistent local volume, the worker, APP_ORIGIN, and DEMO_ACCESS_KEY; see backend/docs and backend/.env.example. Do not upload .env, database contents or node_modules.

The presentation follows the supplied Titanium Sequoia visual system. Design specifications, theme values and internal currency types are confined to source documentation. The static build uses an explicit asset list; backend-home parity and payment-return routing have regression coverage.

## Presenting to stakeholders

Open the hamburger menu for chapters, guest journeys, appearance and fullscreen controls, or use the Next button. In Experience, choose Order & pay to browse three menu items, customise the burger, change quantities, add a kitchen note and tip, and simulate submitting the order. The restaurant view receives the same itemised demo ticket. Choose Pay existing bill to try the separate split-payment journey. Continue to the restaurant view and show the Till offline outcome. Finish with the pricing hypothesis and staged pilot ask. The readiness dialog distinguishes existing backend work from unvalidated integrations. No traction, investment amount or proven financial return is claimed.

## Tests

`npm run check` validates JavaScript and runs 10 ordering tests and 2 presentation packaging checks. After `npm ci --prefix backend`, `npm run test:backend` runs the backend type check and its 18 tests. GitHub Actions runs both suites and the static build. See docs/ORDERING_VALIDATION.md for the browser verification and simulation limits.

The presentation now uses a single frosted navigation menu and shared translucent glass styling in `public/glass.css`. Native dialog behavior provides keyboard focus containment and Escape dismissal. The basket stays in memory while navigating or changing themes.

To export one HTML file for local presenting, run `node scripts/export-presentation.mjs /path/to/Groundwork_Presentation.html`. After changing public assets, copy the six files listed in `scripts/demo-assets.mjs` into `backend/public/`; the parity check catches stale copies.
