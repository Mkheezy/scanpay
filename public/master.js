import { MENU, DemoOrder } from "./order-model.mjs";
(() => {
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  const ids = ["opportunity", "experience", "operations", "business", "pilot"];
  const titles = [
    "Opportunity",
    "Experience",
    "Operations",
    "Business",
    "The pilot",
  ];
  const nextTitles = [
    "Guest experience →",
    "Restaurant view →",
    "Business model →",
    "The pilot ask →",
    "Restart presentation ↺",
  ];
  let slide = 0,
    step = 0,
    share = "half",
    tip = 10,
    outcome = "normal";
  let journey = "order",
    orderStep = 0,
    order = new DemoOrder(),
    orderNotice = "",
    lastOrderStep = -1;
  const escapeHtml = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const money = (c) => "R" + (c / 100).toFixed(2);
  const quote = () => {
    const principal = share === "half" ? 21250 : 42500;
    return { principal, tip: Math.round((principal * tip) / 100) };
  };
  function show(index) {
    slide = index;
    $$(".slide").forEach((s, i) => (s.hidden = i !== index));
    $$("[data-slide]").forEach((b, i) => {
      if (i === index) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
    $("#pageLabel").textContent = `0${index + 1} / 05 · ${titles[index]}`;
    $("#next").textContent = nextTitles[index];
    $("#prev").disabled = index === 0;
    if (location.hash !== "#" + ids[index])
      history.replaceState(null, "", "#" + ids[index]);
    if (index === 2) renderOps();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  $$("[data-slide]").forEach((b) =>
    b.addEventListener("click", () => show(Number(b.dataset.slide))),
  );
  $$("[data-go]").forEach((b) =>
    b.addEventListener("click", () => show(Number(b.dataset.go))),
  );
  $("#next").addEventListener("click", () => show((slide + 1) % 5));
  $("#prev").addEventListener("click", () => show(Math.max(0, slide - 1)));
  window.addEventListener("hashchange", () =>
    show(Math.max(0, ids.indexOf(location.hash.slice(1)))),
  );
  document.addEventListener("keydown", (e) => {
    if (
      $("#readinessDialog").open ||
      /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)
    )
      return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      show(Math.min(4, slide + 1));
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      show(Math.max(0, slide - 1));
    }
  });
  $("#theme").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "titanium-dark";
    document.documentElement.dataset.theme = dark
      ? "titanium-dark"
      : "sequoia-light";
    $("#theme").textContent = dark ? "☀" : "☾";
    $("#theme").setAttribute(
      "aria-label",
      dark ? "Switch to light mode" : "Switch to dark mode",
    );
  });
  $("#present").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      $("#present").textContent = "Use browser fullscreen";
    }
  });

  function updateJourney() {
    $$("[data-journey]").forEach((b) => {
      const active = b.dataset.journey === journey;
      b.classList.toggle("ios-segmented__btn--active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    const labels =
      journey === "order"
        ? [
            ["Choose your meal", "Browse the menu and customise your order."],
            [
              "Review the basket",
              "Check quantities, a kitchen note and your tip.",
            ],
            ["Order & pay", "See a simulated confirmation and kitchen ticket."],
          ]
        : [
            ["Scan the table", "The correct bill opens in the browser."],
            ["Choose a share", "Split the bill and add an optional tip."],
            [
              "Get confirmation",
              "Payment and till update are checked separately.",
            ],
          ];
    $$("[data-step-marker]").forEach((el, i) => {
      el.querySelector("b").textContent = labels[i][0];
      el.querySelector("p").textContent = labels[i][1];
      el.classList.toggle(
        "active",
        i === (journey === "order" ? orderStep : step),
      );
    });
    $(".device-caption").textContent =
      journey === "order"
        ? "Interactive order demo · no kitchen receives this order"
        : "Interactive illustration · no real payment";
  }
  $$("[data-journey]").forEach((b) =>
    b.addEventListener("click", () => {
      journey = b.dataset.journey;
      renderPhone();
      $("#phoneContent").scrollTop = 0;
    }),
  );
  function orderAction(fn) {
    try {
      fn();
      renderPhone();
    } catch (error) {
      orderNotice = error.message;
      const status = $("#orderStatus");
      if (status) status.textContent = orderNotice;
    }
  }
  function renderOrder() {
    const t = order.totals();
    let html = "";
    if (orderStep === 0) {
      html = `<div class="menu-heading"><div><small>TABLE 07 · SAMPLE MENU</small><h3>What sounds good?</h3></div><span class="cart-count" aria-label="${t.count} items in basket">${t.count}</span></div><img class="menu-cover" src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85" alt="Wagyu burger with brioche and salad"><div class="order-menu">${MENU.map((item) => `<article class="menu-item"><div class="menu-item-title"><h4>${item.name}</h4><strong>${money(item.cents)}</strong></div><p>${item.description}</p>${item.modifiers.length ? `<fieldset class="modifiers"><legend>Make it yours</legend>${item.modifiers.map((m) => `<label><input type="checkbox" data-modifier="${m.id}" data-for-item="${item.id}"><span>${m.name}</span><b>+${money(m.cents)}</b></label>`).join("")}</fieldset>` : ""}<button class="add-item" data-add="${item.id}" aria-label="Add ${item.name}">Add to basket <span>+</span></button></article>`).join("")}</div><div class="order-dock"><p id="orderStatus" role="status">${escapeHtml(orderNotice || "Sample prices · demo only")}</p><button class="cta phone-cta" id="reviewOrder" ${t.count ? "" : "disabled"}>Review basket · ${t.count} items <span>${money(t.principal)}</span></button></div>`;
    } else if (orderStep === 1) {
      html = `<button class="order-back" id="backMenu">← Back to menu</button><h3 class="basket-heading">Your basket</h3>${t.count ? order.lines.map((l) => `<article class="basket-line"><div><b>${escapeHtml(l.name)}</b><small>${l.modifiers.length ? escapeHtml(l.modifiers.map((m) => m.name).join(" · ")) : "Standard"} · ${money(l.unitCents)} each</small></div><div class="basket-line-bottom"><div class="quantity-controls"><button data-quantity="${l.key}" data-value="${l.quantity - 1}" aria-label="Decrease ${escapeHtml(l.name)} ${escapeHtml(l.modifiers.map((m) => m.name).join(" "))}">−</button><span>${l.quantity}</span><button data-quantity="${l.key}" data-value="${l.quantity + 1}" aria-label="Increase ${escapeHtml(l.name)} ${escapeHtml(l.modifiers.map((m) => m.name).join(" "))}" ${l.quantity >= 10 || t.count >= 20 ? "disabled" : ""}>+</button></div><strong>${money(l.unitCents * l.quantity)}</strong><button class="remove-item" data-remove="${l.key}" aria-label="Remove ${escapeHtml(l.name)} ${escapeHtml(l.modifiers.map((m) => m.name).join(" "))}">Remove</button></div></article>`).join("") : '<p class="empty-basket">Your basket is empty. Add a dish from the menu.</p>'}<label class="kitchen-note" for="kitchenNote">Kitchen note <span>optional · 120 characters</span></label><textarea id="kitchenNote" maxlength="120" rows="2" placeholder="e.g. no onions">${escapeHtml(order.note)}</textarea><span class="phone-label">Waiter tip · optional</span><div class="phone-tip">${[0, 10, 12, 15].map((n) => `<button data-order-tip="${n}" aria-pressed="${order.tipPercent === n}">${n === 0 ? "No tip" : n + "%"}</button>`).join("")}</div><div class="receipt-mini"><div><span>Food & drinks</span><b>${money(t.principal)}</b></div><div><span>Tip</span><b>${money(t.tip)}</b></div><div><strong>Total</strong><strong>${money(t.total)}</strong></div></div><div class="order-dock"><p id="orderStatus" role="status">${escapeHtml(orderNotice || "Simulation only · no card details required")}</p><button class="cta phone-cta" id="submitOrder" ${t.count ? "" : "disabled"}>Simulate order & pay <span>${money(t.total)}</span></button></div>`;
    } else {
      const r = order.receipt;
      html = `<div class="scan-card order-success"><div class="success-orb">✓</div><h3>Order received.</h3><p>Your meal is on its way—in this demo.</p><div class="receipt-mini"><div><span>Table</span><b>07</b></div><div><span>Demo reference</span><b>${r.reference}</b></div><div><span>${r.count} item${r.count === 1 ? "" : "s"}</span><b>${money(r.principal)}</b></div><div><span>Tip</span><b>${money(r.tip)}</b></div><div><strong>Total paid</strong><strong>${money(r.total)}</strong></div><small>✓ Simulated payment and order confirmation</small></div><button class="cta phone-cta" id="seeOrder">See the restaurant ticket →</button><button class="order-back" id="newOrder">Start a new demo order</button><p class="phone-footnote">No real order was sent. No payment was taken.</p></div>`;
    }
    $("#phoneContent").classList.add("order-content");
    $("#phoneContent").innerHTML = html;
    if (lastOrderStep !== orderStep) {
      $("#phoneContent").scrollTop = 0;
      lastOrderStep = orderStep;
    }
    $$("[data-add]").forEach((b) =>
      b.addEventListener("click", () =>
        orderAction(() => {
          const modifiers = $$("[data-for-item]")
            .filter((el) => el.dataset.forItem === b.dataset.add && el.checked)
            .map((el) => el.dataset.modifier);
          order.add(b.dataset.add, modifiers);
          orderNotice =
            MENU.find((i) => i.id === b.dataset.add).name + " added.";
        }),
      ),
    );
    if ($("#reviewOrder"))
      $("#reviewOrder").addEventListener("click", () => {
        orderStep = 1;
        orderNotice = "";
        renderPhone();
      });
    if ($("#backMenu"))
      $("#backMenu").addEventListener("click", () => {
        orderStep = 0;
        orderNotice = "";
        renderPhone();
      });
    $$("[data-quantity]").forEach((b) =>
      b.addEventListener("click", () =>
        orderAction(() => {
          order.quantity(b.dataset.quantity, Number(b.dataset.value));
          orderNotice = "Basket updated.";
        }),
      ),
    );
    $$("[data-remove]").forEach((b) =>
      b.addEventListener("click", () =>
        orderAction(() => {
          order.quantity(b.dataset.remove, 0);
          orderNotice = "Item removed.";
        }),
      ),
    );
    $$("[data-order-tip]").forEach((b) =>
      b.addEventListener("click", () =>
        orderAction(() => order.setTip(Number(b.dataset.orderTip))),
      ),
    );
    if ($("#kitchenNote"))
      $("#kitchenNote").addEventListener("input", (e) =>
        order.setNote(e.target.value),
      );
    if ($("#submitOrder"))
      $("#submitOrder").addEventListener("click", () =>
        orderAction(() => {
          order.submit();
          orderStep = 2;
          outcome = "normal";
        }),
      );
    if ($("#seeOrder")) $("#seeOrder").addEventListener("click", () => show(2));
    if ($("#newOrder"))
      $("#newOrder").addEventListener("click", () => {
        order = new DemoOrder();
        orderStep = 0;
        orderNotice = "";
        renderPhone();
      });
  }

  function renderPhone() {
    updateJourney();
    if (journey === "order") {
      renderOrder();
      return;
    }
    $("#phoneContent").classList.remove("order-content");
    const q = quote();
    $$("[data-step-marker]").forEach((el, i) =>
      el.classList.toggle("active", i === step),
    );
    let h = "";
    if (step === 0) {
      h = `<div class="scan-card"><img class="scan-photo" src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85" alt="Burger served at the demo restaurant"><h3>A lovely meal.<br>An easier goodbye.</h3><p>Imagine scanning the code on your table. Your bill is ready to view.</p><div class="table-token"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M2 2h18v18H2zm4 4v10h10V6zm22-4h18v18H28zm4 4v10h10V6zM2 28h18v18H2zm4 4v10h10V32zm22-4h8v8h-8zm12 0h6v12h-6zm-12 12h8v6h-8zm12 2h6v4h-6z"/></svg><div><b>Table 07</b><small>Illustrative table code</small></div></div><button class="cta phone-cta" id="scan">Open the table bill →</button></div>`;
    } else if (step === 1) {
      h = `<div class="bill-summary"><span>Table bill · 4 items</span><b>R425.00</b></div><div class="wallet-ring-card"><div class="mini-ring"><svg viewBox="0 0 160 160" aria-hidden="true"><circle class="track" cx="80" cy="80" r="66"/><circle class="share" cx="80" cy="80" r="66" stroke-dasharray="${share === "half" ? 207 : 414} 415"/></svg><div><small>YOUR SHARE</small><strong>${money(q.principal)}</strong></div></div><div class="ios-segmented"><button class="ios-segmented__btn ${share === "half" ? "ios-segmented__btn--active" : ""}" data-share="half">Split in two</button><button class="ios-segmented__btn ${share === "full" ? "ios-segmented__btn--active" : ""}" data-share="full">Full bill</button></div></div><span class="phone-label">An optional thank-you to your waiter</span><div class="phone-tip">${[0, 10, 12, 15].map((n) => `<button data-tip="${n}" aria-pressed="${tip === n}">${n === 0 ? "No tip" : n + "%"}</button>`).join("")}</div><div class="phone-total"><span>Share + ${money(q.tip)} tip</span><b>${money(q.principal + q.tip)}</b></div><button class="cta phone-cta" id="simulate">Simulate payment →</button><p class="phone-footnote">No card details · no money moves</p>`;
    } else {
      h = `<div class="scan-card"><div class="success-orb">✓</div><h3>Your share is settled.</h3><p>Payment verified.<br>Restaurant till updated.</p><div class="receipt-mini"><div><span>Bill share</span><b>${money(q.principal)}</b></div><div><span>Waiter tip</span><b>${money(q.tip)}</b></div><div><strong>Total paid</strong><strong>${money(q.principal + q.tip)}</strong></div><div><small>✓ Both confirmations received</small></div></div><button class="cta phone-cta" id="seeOperator">See the restaurant’s view →</button><p class="phone-footnote">Illustrative confirmation · not a receipt</p></div>`;
    }
    $("#phoneContent").innerHTML = h;
    if ($("#scan"))
      $("#scan").addEventListener("click", () => {
        step = 1;
        renderPhone();
      });
    if ($("#simulate"))
      $("#simulate").addEventListener("click", () => {
        step = 2;
        outcome = "normal";
        renderPhone();
      });
    if ($("#seeOperator"))
      $("#seeOperator").addEventListener("click", () => show(2));
    $$("[data-share]").forEach((b) =>
      b.addEventListener("click", () => {
        share = b.dataset.share;
        renderPhone();
      }),
    );
    $$("[data-tip]").forEach((b) =>
      b.addEventListener("click", () => {
        tip = Number(b.dataset.tip);
        renderPhone();
      }),
    );
  }
  $("#restart").addEventListener("click", () => {
    step = 0;
    share = "half";
    tip = 10;
    orderStep = 0;
    lastOrderStep = -1;
    order = new DemoOrder();
    orderNotice = "";
    renderPhone();
  });
  function renderOps() {
    const receipt = journey === "order" ? order.receipt : null;
    const q = receipt || quote();
    $("#orderTicket").hidden = !receipt;
    if (receipt)
      $("#orderTicket").innerHTML =
        '<span class="ticket-label">SIMULATED KITCHEN TICKET · TABLE 07</span>' +
        receipt.lines
          .map(
            (l) =>
              "<p><b>" +
              l.quantity +
              " × " +
              escapeHtml(l.name) +
              "</b><small>" +
              escapeHtml(l.modifiers.map((m) => m.name).join(", ")) +
              "</small></p>",
          )
          .join("") +
        (receipt.note
          ? "<p>Kitchen note: " + escapeHtml(receipt.note) + "</p>"
          : "");
    $("#opsPrincipal").textContent = money(q.principal);
    $("#opsTip").textContent = money(q.tip);
    $("#opsRemaining").textContent = money(receipt ? 0 : 42500 - q.principal);
    const pending = outcome === "offline";
    $("#opsBadge").textContent = pending
      ? "NEEDS ATTENTION"
      : "PAYMENT MATCHED";
    $("#opsBadge").style.color = pending
      ? "var(--sys-amber)"
      : "var(--sys-green)";
    $("#opsBadge").style.background = pending
      ? "var(--sys-amber-tint)"
      : "var(--sys-green-tint)";
    $("#posConfirmation").innerHTML =
      `<span class="check ${pending ? "pending" : ""}">${pending ? "!" : "✓"}</span><div><b>${pending ? "Till update is waiting" : "Restaurant till confirms the payment"}</b><p>${pending ? "Funds received. Posting will retry when the till is available." : "The same bill share is recorded against Table 07."}</p></div>`;
    $("#opsAction").classList.toggle("pending", pending);
    $("#opsAction").textContent = pending
      ? "Staff can see the exception. The guest is told not to pay again."
      : "No staff intervention needed for this illustrated payment.";
    $$("[data-outcome]").forEach((b) =>
      b.classList.toggle(
        "ios-segmented__btn--active",
        b.dataset.outcome === outcome,
      ),
    );
  }
  $$("[data-outcome]").forEach((b) =>
    b.addEventListener("click", () => {
      outcome = b.dataset.outcome;
      renderOps();
    }),
  );
  $("#readiness").addEventListener("click", () =>
    $("#readinessDialog").showModal(),
  );
  $("#closeDialog").addEventListener("click", () =>
    $("#readinessDialog").close(),
  );
  renderPhone();
  renderOps();
  show(Math.max(0, ids.indexOf(location.hash.slice(1))));
})();
window.addEventListener("load", () =>
  window.scrollTo({ top: 0, behavior: "instant" }),
);
