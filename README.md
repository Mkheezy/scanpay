# Groundwork — Titanium Sequoia Master demo

Five presentation chapters: opportunity, guest experience, restaurant operations, business hypothesis and pilot. The ordering journey now uses the backend when served locally; the static Vercel build remains a clearly labelled device-only preview. All payments and kitchen dispatch are simulated.

## Run the connected demo

Use Node 22. From this folder:

```sh
npm ci --prefix backend
npm run demo
```

Open http://127.0.0.1:4310. The hamburger menu shows the connection status and a five-minute presenter guide. An optional access key is entered through Reconnect restaurant in that menu when the backend requires it. For another port:

```sh
PORT=4311 APP_ORIGIN=http://127.0.0.1:4311 npm run demo
```

Orders persist in backend/.data/groundwork by default (PGlite). Set DATABASE_URL for PostgreSQL or DATA_DIR for another persistent local directory. Do not run two PGlite processes against the same directory. The existing payment test console remains at /sandbox.html#demo.

## What ordering does

- The server validates menu items/modifiers/limits and calculates prices and tips from the shared menu model.
- A request key is saved before submission. Duplicate clicks or a lost response replay the same request and recover the same order.
- Orders, notes, totals and statuses persist in the database. Received → Preparing → Ready transitions are checked by the server.
- A simulated declined payment is saved outside the kitchen workflow. A retry releases the same ticket once; it cannot regress a preparing or ready ticket.
- The restaurant queue and visible guest receipt refresh every five seconds. The queue shows the latest 100 records. In-progress baskets and the current receipt pointer survive page refresh in session storage, separately per tab. Closing a tab can discard its draft; submitted database records remain in the restaurant queue.
- The static preview stores its queue in this browser’s local storage, without shared server storage. It is labelled accordingly. A connected server outage never silently switches an order into preview mode.

The ordering endpoints are demo-only, require a session, and are disabled when DEMO_MODE=false or a non-mock payment provider is selected. Restaurant actions require the merchant/demo-admin role and all reads are venue scoped. Public deployment still needs production authentication, a persistent database and operational controls. Demo orders use a separate table; they do not alter the existing payment ledger or claim actual provider settlement/POS posting.

## Deploy the presentation on Vercel

Import the Git repository and select demo/titanium-sequoia-vercel. Root Directory must be **blank (repository root)**, Framework **Other**, Build Command **npm run build**, Output Directory **public**, Node **22.x**. vercel.json declares the build settings. Do not use backend as the project root: backend is excluded by .vercelignore.

No credentials are needed for this static preview. The backend and worker are not Vercel Functions. Hosting the connected demo requires a separate backend deployment with persistent PostgreSQL or a persistent volume, APP_ORIGIN and DEMO_ACCESS_KEY; see backend/docs and backend/.env.example. Never commit .env, database files or node_modules.

## Present and validate

Read [the five-minute walkthrough](docs/FUNDER_WALKTHROUGH.md). Its timed guide is also available in the hamburger menu. Read [validation and limits](docs/ORDERING_VALIDATION.md) for the automated and browser checks.

```sh
npm run check
npm run test:backend
npm run build
```

GitHub Actions runs both suites and the static build. `npm run sync:demo` copies the seven public assets from site/ to backend/public/; a parity test catches stale copies. `npm run demo` syncs automatically.

For a standalone presentation file:

```sh
node scripts/export-presentation.mjs /path/to/Groundwork_Presentation.html
```

This single HTML file operates in device-only preview mode. Original Google font and photograph URLs require internet access. Design references remain under docs/design-reference and are not shipped to the website. Retired design-page URLs redirect to the presentation.
