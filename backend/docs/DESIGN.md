# Titanium Sequoia Master — Gemini source

The primary presentation now uses the supplied `groundwork_qr_design_system_scss_visualizer.html` directly. The previous invented hero illustration and typography composition have been removed from the presentation. The original master CSS, font imports (Inter and JetBrains Mono with the supplied system-font stack), image URLs, phone screens, merchant bento portal, light/dark comparison and nine-file SCSS explorer are preserved.

## Files and behavior

- `public/index.html`: master presentation and its original component styling.
- `public/master.js`: source interactions, moved out of inline handlers to retain script-src self.
- `styles/master/master.scss`: actual master visualizer CSS, valid SCSS.
- `styles/master/*.module.scss`, `_tokens.scss`, `_mixins.scss`: all nine code examples extracted from the Gemini file. These are reference snippets; master.scss is the visual authority.
- `public/sandbox.html`: existing operational integration console, separately linked from the master; it has not been replaced by sample data.
- `public/checkout.html`: functional mock provider checkout.

The master screens remain a design preview. Their menu ordering, Apple Pay, receipt, table map, ledger and provider confirmations are illustrative, as indicated in the preview banner. The linked operational console uses actual persisted sandbox data. QR guest routes and payment callbacks continue to reach the operational console.

## Necessary repairs

The supplied JavaScript ended the merchant health function halfway through a branch, preventing the entire script from parsing. Closed that branch, restored the outage handler and implemented the missing table selection and sample rotation functions. No payment or POS calls are made by those illustrative controls. Fixed the light theme secondary-button label using the existing primary-label token.

External fonts and images use only the exact Google Fonts, Unsplash and fallback image origins referenced by the supplied file. No replacement/generated imagery was introduced. Fonts and photos require internet access.

## Validation

Master JavaScript syntax, TypeScript check and all 17 backend tests pass. Browser checks confirmed original photographs load, light/dark switching, split calculations, merchant outage and table selection/rotation, and successful handoff to the persistent backend console. The master guest view has no horizontal page overflow at 390px. Publishing remains subject to the previously reported approval restriction.
