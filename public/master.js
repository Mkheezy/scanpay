
// 1. Switch between Light Mode ("sequoia-light"), Dark Mode ("titanium-dark"), and Side-by-Side Compare
    let activeThemeMode = 'sequoia-light';

    function setAppearanceMode(mode) {
      document.getElementById('modeBtnLight').classList.toggle('segmented-pill-bar__btn--active', mode === 'sequoia-light');
      document.getElementById('modeBtnDark').classList.toggle('segmented-pill-bar__btn--active', mode === 'titanium-dark');
      document.getElementById('modeBtnCompare').classList.toggle('segmented-pill-bar__btn--active', mode === 'compare');

      const headerBadge = document.getElementById('activeThemeHeaderBadge');
      const bannerTitle = document.getElementById('bannerModeTitle');
      const bannerSpecs = document.getElementById('bannerModeSpecs');

      if (mode === 'compare') {
        switchHigTab('compare', document.querySelector('[data-tab="compare"]'));
        headerBadge.textContent = '◐ Light vs. Dark Side-by-Side';
        bannerTitle.textContent = 'Comparison Mode: Inspecting Light Mode & Dark Mode Simultaneously';
        bannerSpecs.textContent = 'Left: Silver Sequoia Frost (sequoia-light) • Right: Dark Titanium Sequoia (titanium-dark)';
        return;
      }

      activeThemeMode = mode;
      document.documentElement.setAttribute('data-theme', mode);

      if (mode === 'sequoia-light') {
        headerBadge.textContent = '☀ Silver Sequoia Frost (Light)';
        bannerTitle.textContent = 'Active Mode: ☀ Silver Sequoia Frost (data-theme="sequoia-light")';
        bannerSpecs.textContent = 'Canvas #F2F4F8 • Frosted Glass rgba(255,255,255,0.78) • 0.5px Machined Silver Hairlines • Ink-Black  Pay CTAs';
      } else {
        headerBadge.textContent = '☾ Dark Titanium Sequoia (Dark)';
        bannerTitle.textContent = 'Active Mode: ☾ Dark Titanium Sequoia (data-theme="titanium-dark")';
        bannerSpecs.textContent = 'Canvas #0B0C0E • Smoked Sequoia Glass rgba(24,26,32,0.72) • 0.5px Titanium Rim Speculars • Crisp White  Pay CTAs';
      }

      // If currently on compare tab and user clicks Light or Dark, return to Guest iOS view so they see all 3 phones in that mode
      const comparePanel = document.getElementById('tab-compare');
      if (comparePanel && comparePanel.classList.contains('hig-tab-panel--active')) {
        switchHigTab('guest', document.querySelector('[data-tab="guest"]'));
      }
    }

    function toggleQuickLightDark() {
      const next = activeThemeMode === 'sequoia-light' ? 'titanium-dark' : 'sequoia-light';
      setAppearanceMode(next);
    }

    // 2. Switch Top-Level Workspace Tabs
    function switchHigTab(tabKey, btnEl) {
      document.querySelectorAll('[data-tab]').forEach(btn => btn.classList.remove('segmented-pill-bar__btn--active'));
      if (btnEl) btnEl.classList.add('segmented-pill-bar__btn--active');

      document.querySelectorAll('.hig-tab-panel').forEach(panel => panel.classList.remove('hig-tab-panel--active'));
      document.getElementById('tab-' + tabKey).classList.add('hig-tab-panel--active');
    }

    // 3. Helper: Format Integer Cents to ZAR String
    function formatZar(cents) {
      return 'R ' + (cents / 100).toFixed(2);
    }

    // 4. Frame 1 (Mode A — MenuGlassBentoCard) Integer-Cents Cart Math
    let wagyuQty = 1;
    let sideQty = 1;
    let selectedModsCents = 7500; // Double Wagyu Patty (+R 75.00) default active

    function recalcModeACart() {
      const wagyuUnitCents = 18500 + selectedModsCents;
      const sideUnitCents = 13500;
      const totalCents = (wagyuQty * wagyuUnitCents) + (sideQty * sideUnitCents);
      const itemCount = wagyuQty + sideQty;

      document.getElementById('wagyuQtyDisplay').textContent = wagyuQty;
      document.getElementById('sideQtyDisplay').textContent = sideQty;
      document.getElementById('navBagCount').textContent = itemCount;
      document.getElementById('modeACartSummary').textContent = `${itemCount} Item${itemCount === 1 ? '' : 's'} • Held Order Flow`;
      document.getElementById('modeACartTotal').textContent = formatZar(totalCents);
      document.getElementById('modeAPayBtnText').textContent = formatZar(totalCents);
    }

    function toggleDishMod(pillEl, modCents) {
      const isSelected = pillEl.classList.toggle('modifier-pill--selected');
      selectedModsCents += isSelected ? modCents : -modCents;
      recalcModeACart();
    }

    function changeWagyuQty(delta) {
      wagyuQty = Math.max(0, wagyuQty + delta);
      recalcModeACart();
    }

    function changeSideQty(delta) {
      sideQty = Math.max(0, sideQty + delta);
      recalcModeACart();
    }

    // 5. Frame 2 (Mode B — TitaniumSplitRing + Sequoia Bento Trio) Integer-Cents Math
    const totalBillCents = 60000;      // R 600.00
    const settledBillCents = 17500;    // R 175.00 already paid
    const remainingBillCents = 42500;  // R 425.00 outstanding
    const lineItemCents = [28500, 5500, 8500];
    let checkedLines = [true, true, true];
    let walletSplitMode = 'equal';
    let splitGuestCount = 3;
    let walletTipPct = 10;

    function setWalletSplitMode(mode) {
      walletSplitMode = mode;
      document.getElementById('segEqual').classList.toggle('ios-segmented__btn--active', mode === 'equal');
      document.getElementById('segItem').classList.toggle('ios-segmented__btn--active', mode === 'item');
      document.getElementById('segFull').classList.toggle('ios-segmented__btn--active', mode === 'full');
      recalcWalletSplit();
    }

    function updateSplitGuestCount(delta) {
      splitGuestCount = Math.min(6, Math.max(2, splitGuestCount + delta));
      document.getElementById('splitGuestsDisplay').textContent = splitGuestCount;
      recalcWalletSplit();
    }

    function toggleCheckLine(idx) {
      checkedLines[idx] = !checkedLines[idx];
      const checkEl = document.getElementById('lineCheck' + idx);
      if (checkedLines[idx]) {
        checkEl.style.background = 'var(--sys-accent-blue)';
        checkEl.style.borderColor = 'var(--sys-accent-blue)';
        checkEl.textContent = '✓';
      } else {
        checkEl.style.background = 'transparent';
        checkEl.style.borderColor = 'var(--sys-label-tertiary)';
        checkEl.textContent = '';
      }
      if (walletSplitMode !== 'item') {
        setWalletSplitMode('item');
      } else {
        recalcWalletSplit();
      }
    }

    function setWalletTip(pct, btnEl) {
      walletTipPct = pct;
      document.querySelectorAll('.wallet-tip-pill').forEach(b => b.classList.remove('wallet-tip-pill--active'));
      btnEl.classList.add('wallet-tip-pill--active');
      recalcWalletSplit();
    }

    function recalcWalletSplit() {
      let shareCents = 0;
      const captionEl = document.getElementById('splitMathCaption');
      const stepperEl = document.getElementById('guestCountStepper');

      if (walletSplitMode === 'equal') {
        stepperEl.style.display = 'inline-flex';
        const baseShare = Math.floor(remainingBillCents / splitGuestCount);
        const remainderCents = remainingBillCents % splitGuestCount;
        shareCents = baseShare + (remainderCents > 0 ? 1 : 0);
        captionEl.textContent = `R 425.00 ÷ ${splitGuestCount} guests (rem ${remainderCents}c allocated)`;
      } else if (walletSplitMode === 'item') {
        stepperEl.style.display = 'none';
        shareCents = checkedLines.reduce((acc, isOn, i) => acc + (isOn ? lineItemCents[i] : 0), 0);
        captionEl.textContent = 'Custom line-item claim (locked for 5m)';
      } else {
        stepperEl.style.display = 'none';
        shareCents = remainingBillCents;
        captionEl.textContent = 'Paying full remaining check balance';
      }

      const tipCents = Math.round((shareCents * walletTipPct) / 100);
      const totalWithTipCents = shareCents + tipCents;

      // Update SVG Ring Arc (Circumference = 490)
      const ringCircumference = 490;
      const shareRatio = Math.min(1, shareCents / totalBillCents);
      const arcLength = Math.round(ringCircumference * shareRatio);
      const arcEl = document.getElementById('dynamicShareArc');
      arcEl.style.strokeDashoffset = String(ringCircumference - arcLength);

      document.getElementById('ringCenterAmount').textContent = formatZar(shareCents);
      document.getElementById('bentoYourShareVal').textContent = formatZar(shareCents);
      document.getElementById('walletTipReadout').textContent = `+${formatZar(tipCents)} (${walletTipPct}%)`;
      document.getElementById('walletFinalTotal').textContent = formatZar(totalWithTipCents);
      document.getElementById('walletPayBtnText').textContent = formatZar(totalWithTipCents);
    }

    // 6. Frame 3 (3-Stage Server-Verified Result Sheet)
    function setVerificationState(state) {
      document.getElementById('stateBtnPending').classList.toggle('ios-segmented__btn--active', state === 'POS_SYNC_PENDING');
      document.getElementById('stateBtnSettled').classList.toggle('ios-segmented__btn--active', state === 'SETTLED_IN_POS');
      document.getElementById('stateBtnException').classList.toggle('ios-segmented__btn--active', state === 'MANUAL_REVIEW');

      const orb = document.getElementById('resultOrb');
      const badge = document.getElementById('resultStateBadge');
      const headline = document.getElementById('resultHeadline');
      const desc = document.getElementById('resultDescription');
      const badge3 = document.getElementById('timelineBadge3');
      const title3 = document.getElementById('timelineTitle3');
      const desc3 = document.getElementById('timelineDesc3');
      const islandDot = document.getElementById('islandStatusDot');
      const islandText = document.getElementById('islandStatusText');
      const footerLabel = document.getElementById('resultFooterLabel');
      const footerCta = document.getElementById('resultFooterCta');

      orb.className = 'result-hero-sheet__orb';

      if (state === 'POS_SYNC_PENDING') {
        orb.classList.add('result-hero-sheet__orb--pending');
        orb.textContent = '↻';
        badge.textContent = 'STATE: VERIFIED_FUNDS → POS_SYNC_PENDING';
        headline.textContent = 'Syncing with Restaurant POS...';
        desc.textContent = 'Paystack confirmed your funds. Posting external payment reference to Pilot POS Check #804.';
        badge3.className = 'timeline-node__badge timeline-node__badge--pending';
        badge3.textContent = '…';
        title3.textContent = '3. Awaiting POS Check #804 Commit';
        desc3.textContent = 'Exponential backoff worker attempt 1 of 5 active.';
        islandDot.style.background = 'var(--sys-amber)';
        islandText.textContent = 'SYNCING';
        footerLabel.textContent = 'Verifying POS Write';
        footerCta.innerHTML = '<span>Polling...</span>';
      } else if (state === 'SETTLED_IN_POS') {
        orb.classList.add('result-hero-sheet__orb--settled');
        orb.textContent = '✓';
        badge.textContent = 'STATE: SETTLED_IN_POS';
        headline.textContent = 'Confirmed in Restaurant POS';
        desc.textContent = 'Your payment was cryptographically verified via Paystack and posted directly to Check #804 at Table 12.';
        badge3.className = 'timeline-node__badge timeline-node__badge--done';
        badge3.textContent = '✓';
        title3.textContent = '3. POS Check #804 Acknowledged';
        desc3.textContent = 'Native POS receipt PILOT-PAY-4410 recorded. Zero duplicate risk.';
        islandDot.style.background = 'var(--sys-green)';
        islandText.textContent = 'VERIFIED';
        footerLabel.textContent = 'Tax Invoice Ready';
        footerCta.innerHTML = '<span>Receipt PDF</span>';
      } else {
        orb.classList.add('result-hero-sheet__orb--exception');
        orb.textContent = '!';
        badge.textContent = 'STATE: MANUAL_REVIEW (POS WRITE REJECTED)';
        headline.textContent = 'Floor Manager Alerted to Assist';
        desc.textContent = 'Your payment was captured once, but the restaurant POS check was locked by a terminal. Duplicate charges are blocked.';
        badge3.className = 'timeline-node__badge timeline-node__badge--exception';
        badge3.textContent = '!';
        title3.textContent = '3. POS Sync Exception Logged';
        desc3.textContent = 'Ref gw_corr_99481a • Automatic refund or manual POS post queued.';
        islandDot.style.background = 'var(--sys-red)';
        islandText.textContent = 'REVIEW';
        footerLabel.textContent = 'Escalated to Staff';
        footerCta.innerHTML = '<span>Ref: 99481a</span>';
      }
    }

    function pulseResultHighlight() {
      setVerificationState('POS_SYNC_PENDING');
      setTimeout(() => setVerificationState('SETTLED_IN_POS'), 900);
    }

    // 7. Tab 2: Titanium Sequoia Merchant Portal Interactions
    let activeSelectedTable = 12;

    function setSequoiaPosHealth(state, btnEl) {
      btnEl.parentElement.querySelectorAll('.segmented-pill-bar__btn').forEach(b => b.classList.remove('segmented-pill-bar__btn--active'));
      btnEl.classList.add('segmented-pill-bar__btn--active');

      const pill = document.getElementById('bentoHealthPill');
      const desc = document.getElementById('bentoHealthDesc');
      const sideBadge = document.getElementById('sidebarHealthBadge');

      if (state === 'OK') {
        pill.textContent = '● ACTIVE';
        pill.style.background = 'var(--sys-green-tint)';
        pill.style.color = 'var(--sys-green)';
        desc.textContent = 'MockPosAdapter Sandbox Connected • Pilot/GAAP Skeletons Fail-Closed';
        sideBadge.textContent = 'OK';
        sideBadge.style.color = 'var(--sys-green)';
      } else if (state === 'DEGRADED') {
        pill.textContent = '● DEGRADED';
        pill.style.background = 'var(--sys-amber-tint)';
        pill.style.color = 'var(--sys-amber)';
        desc.textContent = 'Elevated POS Polling Latency (640ms) • Outbox Retries Active';
        sideBadge.textContent = 'WARN';
        sideBadge.style.color = 'var(--sys-amber)';
      } else {
        pill.textContent = '● UNAVAILABLE';
        pill.style.background = 'var(--sys-red-tint)';
        pill.style.color = 'var(--sys-red)';
        desc.textContent = 'Illustrative POS outage • no live connection changed';
        sideBadge.textContent = 'DOWN';
        sideBadge.style.color = 'var(--sys-red)';
      }
    }
    function selectAndRotateTable(number, button) {
      activeSelectedTable = number;
      document.querySelectorAll('.table-orb').forEach(el => el.classList.remove('table-orb--selected'));
      button.classList.add('table-orb--selected');
      document.getElementById('plaqueTableTitle').textContent = 'TABLE ' + number;
      document.getElementById('selectedTableTokenLabel').textContent = 'Selected: Table ' + number + ' • illustrative token';
      document.getElementById('plaqueTokenCode').textContent = '/t/demo-' + number;
    }
    let demoRotation = 0;
    function triggerManualRotate() {
      demoRotation += 1;
      document.getElementById('plaqueTokenCode').textContent = '/t/demo-' + activeSelectedTable + '-' + demoRotation;
      document.getElementById('selectedTableTokenLabel').textContent = 'Table ' + activeSelectedTable + ' • sample token rotated';
    }
    // 8. Tab 4: Complete 9-File Modular SCSS Repository for Astra (Dual-Mode Light + Dark)
    const SCSS_FILE_REPO = {
      '_tokens.scss': `// 1. packages/ui/src/styles/_tokens.scss
// "Titanium Sequoia" Dual-Mode Hybrid Design Tokens (Zero Tailwind)
// Includes:
//   1) LIGHT MODE (Default): [data-theme="sequoia-light"] ("Silver Sequoia Frost")
//   2) DARK MODE:            [data-theme="titanium-dark"] ("Dark Titanium Sequoia")

:root,
[data-theme="sequoia-light"] {
  color-scheme: light;

  // Canvas & Daylight Radial Mesh
  --sys-bg-canvas: #F2F4F8;
  --sys-bg-mesh:
    radial-gradient(circle at 14% 16%, rgba(16, 185, 129, 0.13), transparent 42%),
    radial-gradient(circle at 86% 20%, rgba(10, 132, 255, 0.14), transparent 46%),
    radial-gradient(circle at 52% 84%, rgba(212, 197, 177, 0.28), transparent 50%),
    linear-gradient(180deg, #F7F9FC 0%, #E8ECF3 100%);

  // Silver Brushed Titanium + macOS Sequoia Daylight Frosted Glass
  --sys-bg-elevated: #FFFFFF;
  --sys-bg-bento-tile: rgba(255, 255, 255, 0.72);
  --sys-bg-grouped: rgba(228, 233, 242, 0.78);
  --sys-glass-surface: rgba(255, 255, 255, 0.78);
  --sys-glass-strong: rgba(255, 255, 255, 0.92);

  // 0.5px Machined Silver Hairlines & Crisp Inner White Specular Highlights
  --sys-glass-specular: rgba(255, 255, 255, 0.90);
  --sys-hairline: rgba(15, 23, 42, 0.08);
  --sys-hairline-strong: rgba(15, 23, 42, 0.14);

  // Deep Obsidian Typography
  --sys-label-primary: #111215;
  --sys-label-secondary: #5A606D;
  --sys-label-tertiary: #8C93A0;
  --sys-titanium-champagne: #6E604F;

  // Ink-Black Apple Pay Primary CTA in Light Mode
  --sys-accent-primary: #111215;
  --sys-accent-primary-fg: #FFFFFF;
  --sys-accent-blue: #0066CC;

  // Semantic POS States
  --sys-green: #059669;
  --sys-amber: #D97706;
  --sys-red: #DC2626;
}

[data-theme="titanium-dark"] {
  color-scheme: dark;

  // Deep Brushed Dark Titanium + Ambient Radial Mesh
  --sys-bg-canvas: #0B0C0E;
  --sys-bg-mesh:
    radial-gradient(circle at 14% 16%, rgba(16, 185, 129, 0.15), transparent 40%),
    radial-gradient(circle at 86% 20%, rgba(10, 132, 255, 0.17), transparent 44%),
    radial-gradient(circle at 52% 84%, rgba(212, 197, 177, 0.11), transparent 48%),
    linear-gradient(180deg, #0D0F13 0%, #090A0D 100%);

  // Translucent Dark Sequoia Glass
  --sys-bg-elevated: rgba(24, 26, 32, 0.72);
  --sys-bg-bento-tile: rgba(36, 39, 48, 0.56);
  --sys-bg-grouped: rgba(16, 18, 23, 0.76);
  --sys-glass-surface: rgba(24, 26, 32, 0.72);
  --sys-glass-strong: rgba(28, 31, 39, 0.86);

  // 0.5px Machined Titanium Rim Speculars
  --sys-glass-specular: rgba(255, 255, 255, 0.14);
  --sys-hairline: rgba(255, 255, 255, 0.11);
  --sys-hairline-strong: rgba(212, 197, 177, 0.28);

  // Optical Typography
  --sys-label-primary: #F5F5F7;
  --sys-label-secondary: #A1A1AA;
  --sys-label-tertiary: #6E6E77;
  --sys-titanium-champagne: #D4C5B1;

  // Crisp White Apple Pay Primary CTA in Dark Mode
  --sys-accent-primary: #F5F5F7;
  --sys-accent-primary-fg: #0B0C0E;
  --sys-accent-blue: #0A84FF;

  // Semantic POS States
  --sys-green: #10B981;
  --sys-amber: #F59E0B;
  --sys-red: #FF453A;
}

$font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif;
$font-mono: "SF Mono", "JetBrains Mono", monospace;
$ease-spring: cubic-bezier(0.22, 1, 0.36, 1);
$radius-squircle-xl: 28px;
$radius-squircle-lg: 22px;
$radius-squircle-md: 16px;
$radius-squircle-sm: 12px;
$radius-pill: 9999px;`,

      '_mixins.scss': `// 2. packages/ui/src/styles/_mixins.scss
// Sequoia Vibrancy Glass, Machined Titanium Rim Speculars, and Tabular ZAR Math

@use "tokens" as *;

@mixin sequoia-vibrancy-glass($blur: 28px) {
  background: var(--sys-glass-surface);
  backdrop-filter: saturate(190%) blur($blur);
  -webkit-backdrop-filter: saturate(190%) blur($blur);
  border: 0.5px solid var(--sys-hairline-strong);
  box-shadow: inset 0 0.5px 0 0 var(--sys-glass-specular);
}

@mixin titanium-bento-card($radius: $radius-squircle-lg) {
  background: var(--sys-bg-elevated);
  backdrop-filter: saturate(190%) blur(24px);
  -webkit-backdrop-filter: saturate(190%) blur(24px);
  border-radius: $radius;
  border: 0.5px solid var(--sys-hairline-strong);
  box-shadow: 0 16px 36px -8px rgba(0, 0, 0, 0.65), inset 0 0.5px 0 0 var(--sys-glass-specular);
  transition: transform 0.28s $ease-spring, box-shadow 0.28s $ease-spring;
}

@mixin zar-tabular {
  font-family: $font-sans;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.025em;
  -webkit-font-smoothing: antialiased;
}

@mixin spring-press {
  cursor: pointer;
  user-select: none;
  transition: transform 0.2s $ease-spring, opacity 0.2s ease;

  &:active:not(:disabled) {
    transform: scale(0.96);
    opacity: 0.88;
  }
}`,

      'GlassNavigationBar.module.scss': `// 3. packages/ui/src/components/GlassNavigationBar/GlassNavigationBar.module.scss
@use "../../styles/tokens" as *;
@use "../../styles/mixins" as *;

.navigationBar {
  @include sequoia-vibrancy-glass(26px);
  position: sticky;
  top: 0;
  z-index: 30;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;

  &__venueBrand {
    font-family: $font-sans;
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--sys-label-primary);
  }

  &__tablePill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--sys-bg-bento-tile);
    padding: 4px 12px;
    border-radius: $radius-pill;
    font-size: 0.74rem;
    font-weight: 600;
    border: 0.5px solid var(--sys-hairline-strong);
    color: var(--sys-titanium-champagne);
  }

  &__bagCounter {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--sys-accent-primary);
    color: var(--sys-accent-primary-fg);
    display: grid;
    place-items: center;
    font-size: 0.74rem;
    font-weight: 700;
  }
}`,

      'MenuGlassBentoCard.module.scss': `// 4. packages/ui/src/components/MenuGlassBentoCard/MenuGlassBentoCard.module.scss
@use "../../styles/tokens" as *;
@use "../../styles/mixins" as *;

.bentoStrip {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;

  &__tile {
    background: var(--sys-bg-bento-tile);
    backdrop-filter: saturate(180%) blur(20px);
    border-radius: $radius-squircle-sm;
    border: 0.5px solid var(--sys-hairline);
    box-shadow: inset 0 0.5px 0 0 var(--sys-glass-specular);
    padding: 8px 11px;
  }
}

.heroDishCard {
  @include titanium-bento-card($radius-squircle-xl);
  overflow: hidden;

  &__media {
    position: relative;
    height: 198px;
    width: 100%;
    overflow: hidden;
  }

  &__priceBadge {
    @include sequoia-vibrancy-glass(16px);
    @include zar-tabular;
    position: absolute;
    top: 12px;
    right: 12px;
    padding: 5px 12px;
    border-radius: $radius-pill;
    font-size: 0.8125rem;
    font-weight: 600;
  }

  &__modifierPill {
    @include spring-press;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 11px;
    border-radius: $radius-squircle-sm;
    background: var(--sys-bg-bento-tile);
    border: 0.5px solid var(--sys-hairline);

    &--selected {
      border-color: var(--sys-accent-blue);
      background: rgba(10, 132, 255, 0.18);
    }
  }
}`,

      'TitaniumSplitRing.module.scss': `// 5. packages/ui/src/components/TitaniumSplitRing/TitaniumSplitRing.module.scss
@use "../../styles/tokens" as *;
@use "../../styles/mixins" as *;

.splitRingContainer {
  @include titanium-bento-card($radius-squircle-xl);
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  overflow: hidden;

  &__ambientGlow {
    position: absolute;
    width: 190px;
    height: 190px;
    top: 18px;
    border-radius: 50%;
    background: conic-gradient(from 90deg, #10B981, #0A84FF, #D4C5B1, #F59E0B, #10B981);
    filter: blur(34px);
    opacity: 0.42;
    pointer-events: none;
  }

  &__bentoTrio {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 10px;
  }

  &__bentoCell {
    background: var(--sys-bg-bento-tile);
    border: 0.5px solid var(--sys-hairline);
    border-radius: 10px;
    padding: 6px 8px;
    text-align: center;
    box-shadow: inset 0 0.5px 0 0 var(--sys-glass-specular);
  }

  &__centerZar {
    @include zar-tabular;
    font-size: 1.45rem;
    font-weight: 700;
    color: var(--sys-label-primary);
  }
}`,

      'SequoiaFloatingDock.module.scss': `// 6. packages/ui/src/components/SequoiaFloatingDock/SequoiaFloatingDock.module.scss
@use "../../styles/tokens" as *;
@use "../../styles/mixins" as *;

.floatingDock {
  position: sticky;
  bottom: 12px;
  z-index: 25;
  padding: 0 14px;

  &__glassBar {
    @include sequoia-vibrancy-glass(28px);
    border-radius: $radius-pill;
    padding: 7px 8px 7px 18px;
    box-shadow: 0 28px 60px -12px rgba(0, 0, 0, 0.92);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__totalZar {
    @include zar-tabular;
    font-size: 1.02rem;
    font-weight: 700;
  }

  &__applePayButton {
    @include spring-press;
    height: 42px;
    padding: 0 18px;
    border-radius: $radius-pill;
    border: 0.5px solid rgba(255, 255, 255, 0.35);
    background: var(--sys-accent-primary);
    color: var(--sys-accent-primary-fg);
    font-size: 0.85rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
}`,

      'PosVerificationSheet.module.scss': `// 7. packages/ui/src/components/PosVerificationSheet/PosVerificationSheet.module.scss
@use "../../styles/tokens" as *;
@use "../../styles/mixins" as *;

.verificationHero {
  @include titanium-bento-card($radius-squircle-xl);
  padding: 20px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;

  &__orb {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 1.45rem;
    font-weight: 700;
  }
}

.timelineSheet {
  @include titanium-bento-card($radius-squircle-lg);
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 13px;

  &__node {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    font-size: 0.78rem;
  }
}`,

      'MerchantSequoiaBento.module.scss': `// 8. packages/ui/src/components/MerchantSequoiaBento/MerchantSequoiaBento.module.scss
@use "../../styles/tokens" as *;
@use "../../styles/mixins" as *;

.sequoiaWindow {
  @include sequoia-vibrancy-glass(32px);
  border-radius: $radius-squircle-xl;
  display: grid;
  grid-template-columns: 236px 1fr;
  overflow: hidden;
  min-height: 720px;
}

.bentoCard {
  @include titanium-bento-card($radius-squircle-lg);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;

  &__metricZar {
    @include zar-tabular;
    font-size: 1.85rem;
    font-weight: 700;
    color: var(--sys-label-primary);
  }
}

.tableOrb {
  @include spring-press;
  aspect-ratio: 1;
  border-radius: 18px;
  border: 1px solid var(--sys-hairline-strong);
  background: var(--sys-bg-bento-tile);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}`,

      'PrintableQrStand.module.scss': `// 9. packages/ui/src/components/PrintableQrStand/PrintableQrStand.module.scss
// High-Contrast A6 / A7 Physical Table Stand with 4-Module Quiet Zone
@use "../../styles/tokens" as *;

.qrStandPlaque {
  background: #FFFFFF;
  color: #090A0D;
  border-radius: 12px;
  padding: 12px;
  text-align: center;
  border: 1.5px solid #D4C5B1;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);

  &__venueHeader {
    font-family: $font-sans;
    font-size: 0.625rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  &__tableTitle {
    font-family: $font-sans;
    font-size: 0.875rem;
    font-weight: 800;
    margin-top: 4px;
  }

  &__opaqueRoute {
    font-family: $font-mono;
    font-size: 0.625rem;
    color: #52525B;
  }
}

@media print {
  .qrStandPlaque {
    width: 105mm;
    height: 148mm;
    box-shadow: none;
    border: 1px solid #000000;
    page-break-inside: avoid;
  }
}`
    };

    let currentScssFileKey = '_tokens.scss';

    function renderScssFile(fileKey, btnEl) {
      currentScssFileKey = fileKey;
      document.querySelectorAll('.scss-file-btn').forEach(b => b.classList.remove('scss-file-btn--active'));
      if (btnEl) {
        btnEl.classList.add('scss-file-btn--active');
      } else {
        const match = document.querySelector(`.scss-file-btn[data-file="${fileKey}"]`);
        if (match) match.classList.add('scss-file-btn--active');
      }

      const folder = fileKey.startsWith('_')
        ? 'packages/ui/src/styles/'
        : `packages/ui/src/components/${fileKey.replace('.module.scss', '')}/`;
      document.getElementById('scssFilePathLabel').textContent = folder + fileKey;
      document.getElementById('scssCodeViewport').textContent = SCSS_FILE_REPO[fileKey];
    }

    function jumpToScss(fileKey) {
      switchHigTab('scss', document.querySelector('[data-tab="scss"]'));
      renderScssFile(fileKey, null);
    }

    function copyToClipboard(text, btnId, confirmLabel) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);

      const btn = document.getElementById(btnId);
      const original = btn.textContent;
      btn.textContent = confirmLabel;
      setTimeout(() => { btn.textContent = original; }, 1800);
    }

    function copyActiveScssFile() {
      copyToClipboard(SCSS_FILE_REPO[currentScssFileKey], 'copySingleBtn', '✓ Copied ' + currentScssFileKey);
    }

    function copyAllNineScssFiles() {
      const bundle = Object.keys(SCSS_FILE_REPO)
        .map(k => SCSS_FILE_REPO[k])
        .join('\n\n/* ========================================================================== */\n\n');
      copyToClipboard(bundle, 'copyBundleBtn', '✓ Copied All 9 .module.scss Files!');
    }

    window.onload = function () {
      recalcModeACart();
      recalcWalletSplit();
      renderScssFile('_tokens.scss', document.querySelector('.scss-file-btn'));
    };
  
document.querySelector("[data-master-event-0]").addEventListener("click", function(event) { setAppearanceMode('sequoia-light') });
document.querySelector("[data-master-event-1]").addEventListener("click", function(event) { setAppearanceMode('titanium-dark') });
document.querySelector("[data-master-event-2]").addEventListener("click", function(event) { setAppearanceMode('compare') });
document.querySelector("[data-master-event-3]").addEventListener("click", function(event) { switchHigTab('guest', this) });
document.querySelector("[data-master-event-4]").addEventListener("click", function(event) { switchHigTab('compare', this) });
document.querySelector("[data-master-event-5]").addEventListener("click", function(event) { switchHigTab('sequoia', this) });
document.querySelector("[data-master-event-6]").addEventListener("click", function(event) { switchHigTab('scss', this) });
document.querySelector("[data-master-event-7]").addEventListener("click", function(event) { toggleQuickLightDark() });
document.querySelector("[data-master-event-8]").addEventListener("click", function(event) { setAppearanceMode('compare') });
document.querySelector("[data-master-event-9]").addEventListener("click", function(event) { jumpToScss('MenuGlassBentoCard.module.scss') });
document.querySelector("[data-master-event-10]").addEventListener("error", function(event) { this.src='https://placehold.co/600x400/1c1c1e/ffffff?text=Wagyu+Burger' });
document.querySelector("[data-master-event-11]").addEventListener("click", function(event) { toggleDishMod(this, 7500) });
document.querySelector("[data-master-event-12]").addEventListener("click", function(event) { toggleDishMod(this, 3000) });
document.querySelector("[data-master-event-13]").addEventListener("click", function(event) { toggleDishMod(this, 1800) });
document.querySelector("[data-master-event-14]").addEventListener("click", function(event) { changeWagyuQty(-1) });
document.querySelector("[data-master-event-15]").addEventListener("click", function(event) { changeWagyuQty(1) });
document.querySelector("[data-master-event-16]").addEventListener("click", function(event) { changeSideQty(-1) });
document.querySelector("[data-master-event-17]").addEventListener("click", function(event) { changeSideQty(1) });
document.querySelector("[data-master-event-18]").addEventListener("error", function(event) { this.src='https://placehold.co/200x200/1c1c1e/ffffff?text=Crudo' });
document.querySelector("[data-master-event-19]").addEventListener("click", function(event) { pulseResultHighlight() });
document.querySelector("[data-master-event-20]").addEventListener("click", function(event) { jumpToScss('TitaniumSplitRing.module.scss') });
document.querySelector("[data-master-event-21]").addEventListener("click", function(event) { setWalletSplitMode('equal') });
document.querySelector("[data-master-event-22]").addEventListener("click", function(event) { setWalletSplitMode('item') });
document.querySelector("[data-master-event-23]").addEventListener("click", function(event) { setWalletSplitMode('full') });
document.querySelector("[data-master-event-24]").addEventListener("click", function(event) { updateSplitGuestCount(-1) });
document.querySelector("[data-master-event-25]").addEventListener("click", function(event) { updateSplitGuestCount(1) });
document.querySelector("[data-master-event-26]").addEventListener("click", function(event) { toggleCheckLine(0) });
document.querySelector("[data-master-event-27]").addEventListener("click", function(event) { toggleCheckLine(1) });
document.querySelector("[data-master-event-28]").addEventListener("click", function(event) { toggleCheckLine(2) });
document.querySelector("[data-master-event-29]").addEventListener("click", function(event) { setWalletTip(0, this) });
document.querySelector("[data-master-event-30]").addEventListener("click", function(event) { setWalletTip(10, this) });
document.querySelector("[data-master-event-31]").addEventListener("click", function(event) { setWalletTip(12, this) });
document.querySelector("[data-master-event-32]").addEventListener("click", function(event) { setWalletTip(15, this) });
document.querySelector("[data-master-event-33]").addEventListener("click", function(event) { pulseResultHighlight() });
document.querySelector("[data-master-event-34]").addEventListener("click", function(event) { jumpToScss('PosVerificationSheet.module.scss') });
document.querySelector("[data-master-event-35]").addEventListener("click", function(event) { setVerificationState('POS_SYNC_PENDING') });
document.querySelector("[data-master-event-36]").addEventListener("click", function(event) { setVerificationState('SETTLED_IN_POS') });
document.querySelector("[data-master-event-37]").addEventListener("click", function(event) { setVerificationState('MANUAL_REVIEW') });
document.querySelector("[data-master-event-38]").addEventListener("click", function(event) { setAppearanceMode('sequoia-light') });
document.querySelector("[data-master-event-39]").addEventListener("click", function(event) { setAppearanceMode('sequoia-light') });
document.querySelector("[data-master-event-40]").addEventListener("click", function(event) { setAppearanceMode('titanium-dark') });
document.querySelector("[data-master-event-41]").addEventListener("click", function(event) { setAppearanceMode('titanium-dark') });
document.querySelector("[data-master-event-42]").addEventListener("click", function(event) { switchHigTab('scss', document.querySelector('[data-tab=scss]')) });
document.querySelector("[data-master-event-43]").addEventListener("click", function(event) { setSequoiaPosHealth('OK', this) });
document.querySelector("[data-master-event-44]").addEventListener("click", function(event) { setSequoiaPosHealth('DEGRADED', this) });
document.querySelector("[data-master-event-45]").addEventListener("click", function(event) { setSequoiaPosHealth('POS_UNAVAILABLE', this) });
document.querySelector("[data-master-event-46]").addEventListener("click", function(event) { selectAndRotateTable(1, this) });
document.querySelector("[data-master-event-47]").addEventListener("click", function(event) { selectAndRotateTable(2, this) });
document.querySelector("[data-master-event-48]").addEventListener("click", function(event) { selectAndRotateTable(3, this) });
document.querySelector("[data-master-event-49]").addEventListener("click", function(event) { selectAndRotateTable(4, this) });
document.querySelector("[data-master-event-50]").addEventListener("click", function(event) { selectAndRotateTable(5, this) });
document.querySelector("[data-master-event-51]").addEventListener("click", function(event) { selectAndRotateTable(6, this) });
document.querySelector("[data-master-event-52]").addEventListener("click", function(event) { selectAndRotateTable(7, this) });
document.querySelector("[data-master-event-53]").addEventListener("click", function(event) { selectAndRotateTable(8, this) });
document.querySelector("[data-master-event-54]").addEventListener("click", function(event) { selectAndRotateTable(9, this) });
document.querySelector("[data-master-event-55]").addEventListener("click", function(event) { selectAndRotateTable(10, this) });
document.querySelector("[data-master-event-56]").addEventListener("click", function(event) { selectAndRotateTable(11, this) });
document.querySelector("[data-master-event-57]").addEventListener("click", function(event) { selectAndRotateTable(12, this) });
document.querySelector("[data-master-event-58]").addEventListener("click", function(event) { triggerManualRotate() });
document.querySelector("[data-master-event-59]").addEventListener("click", function(event) { jumpToScss('PrintableQrStand.module.scss') });
document.querySelector("[data-master-event-60]").addEventListener("click", function(event) { renderScssFile('_tokens.scss', this) });
document.querySelector("[data-master-event-61]").addEventListener("click", function(event) { renderScssFile('_mixins.scss', this) });
document.querySelector("[data-master-event-62]").addEventListener("click", function(event) { renderScssFile('GlassNavigationBar.module.scss', this) });
document.querySelector("[data-master-event-63]").addEventListener("click", function(event) { renderScssFile('MenuGlassBentoCard.module.scss', this) });
document.querySelector("[data-master-event-64]").addEventListener("click", function(event) { renderScssFile('TitaniumSplitRing.module.scss', this) });
document.querySelector("[data-master-event-65]").addEventListener("click", function(event) { renderScssFile('SequoiaFloatingDock.module.scss', this) });
document.querySelector("[data-master-event-66]").addEventListener("click", function(event) { renderScssFile('PosVerificationSheet.module.scss', this) });
document.querySelector("[data-master-event-67]").addEventListener("click", function(event) { renderScssFile('MerchantSequoiaBento.module.scss', this) });
document.querySelector("[data-master-event-68]").addEventListener("click", function(event) { renderScssFile('PrintableQrStand.module.scss', this) });
document.querySelector("[data-master-event-69]").addEventListener("click", function(event) { copyActiveScssFile() });
document.querySelector("[data-master-event-70]").addEventListener("click", function(event) { copyAllNineScssFiles() });