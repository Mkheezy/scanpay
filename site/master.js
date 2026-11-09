import { MENU, DemoOrder } from "./order-model.mjs";
import { OrderStore, restoreBasket } from "./order-store.mjs";
(() => {
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  let store;
  try {
    store = new OrderStore({
      storage: sessionStorage,
      queueStorage: localStorage,
    });
  } catch {
    store = new OrderStore({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw Error("Storage unavailable");
        },
      },
    });
  }
  let paymentOutcome = "success",
    queueLoading = false,
    queueOrders = [],
    queueFingerprint = "";
  const statusLabel = (status) =>
    ({
      RECEIVED: "Received",
      PREPARING: "Preparing",
      READY: "Ready",
      PAYMENT_FAILED: "Payment declined",
    })[status] || "Checking";
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
  const navigation = $("#navigationDialog");
  function closeNavigation() {
    if (navigation.open) navigation.close();
  }
  $("#menuToggle").addEventListener("click", () => {
    navigation.showModal();
    $("#menuToggle").setAttribute("aria-expanded", "true");
  });
  $("#closeNavigation").addEventListener("click", closeNavigation);
  navigation.addEventListener("close", () =>
    $("#menuToggle").setAttribute("aria-expanded", "false"),
  );
  navigation.addEventListener("click", (event) => {
    if (event.target !== navigation) return;
    const rect = navigation.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      closeNavigation();
  });
  function show(index) {
    closeNavigation();
    $("#headerChapter").textContent = titles[index];
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
    if (index === 1) renderPhone();
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
      navigation.open ||
      $("#presenterDialog").open ||
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
    $("#themeLabel").textContent = dark
      ? "Light appearance"
      : "Dark appearance";
    $("#theme").setAttribute(
      "aria-label",
      dark ? "Switch to light mode" : "Switch to dark mode",
    );
  });
  $("#present").addEventListener("click", async () => {
    closeNavigation();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      $("#present").textContent = "Use browser fullscreen";
    }
  });

  function updateJourney() {
    $("#journeyLabel").textContent =
      journey === "order" ? "Order & pay" : "Pay existing bill";
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
            [
              "Order & pay",
              "Follow your demo order from confirmation to ready.",
            ],
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
      store.mode === "database"
        ? "Connected demo · orders saved · no real payments"
        : store.mode === "preview"
          ? "Device-only preview · no real orders or payments"
          : "Connecting · no real payments";
  }
  $$("[data-journey]").forEach((b) =>
    b.addEventListener("click", () => {
      journey = b.dataset.journey;
      show(1);
      renderPhone();
      $("#phoneContent").scrollTop = 0;
    }),
  );
  function orderAction(fn) {
    try {
      fn();
      store.draft(order);
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
      html = `<div class="menu-heading"><div><small>TABLE 07 · SAMPLE MENU</small><h3>What sounds good?</h3></div><span class="cart-count" aria-label="${t.count} items in basket">${t.count}</span></div><img class="menu-cover" src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85" alt="Wagyu burger with brioche and salad"><div class="order-menu">${MENU.map((item) => `<article class="menu-item"><div class="menu-item-title"><h4>${item.name}</h4><strong>${money(item.cents)}</strong></div><p>${item.description}</p>${item.modifiers.length ? `<fieldset class="modifiers"><legend>Make it yours</legend>${item.modifiers.map((m) => `<label><input type="checkbox" data-modifier="${m.id}" data-for-item="${item.id}"><span>${m.name}</span><b>+${money(m.cents)}</b></label>`).join("")}</fieldset>` : ""}<button class="add-item" data-add="${item.id}" aria-label="Add ${item.name}">Add to basket <span>+</span></button></article>`).join("")}</div><div class="order-dock"><p id="orderStatus" role="status">${escapeHtml(orderNotice || "Sample menu · prices in rand")}</p><button class="cta phone-cta" id="reviewOrder" ${t.count ? "" : "disabled"}>Review basket · ${t.count} items <span>${money(t.principal)}</span></button></div>`;
    } else if (orderStep === 1) {
      html = `<button class="order-back" id="backMenu">← Back to menu</button><h3 class="basket-heading">Your basket</h3>${t.count ? order.lines.map((l) => `<article class="basket-line"><div><b>${escapeHtml(l.name)}</b><small>${l.modifiers.length ? escapeHtml(l.modifiers.map((m) => m.name).join(" · ")) : "Standard"} · ${money(l.unitCents)} each</small></div><div class="basket-line-bottom"><div class="quantity-controls"><button data-quantity="${l.key}" data-value="${l.quantity - 1}" aria-label="Decrease ${escapeHtml(l.name)} ${escapeHtml(l.modifiers.map((m) => m.name).join(" "))}">−</button><span>${l.quantity}</span><button data-quantity="${l.key}" data-value="${l.quantity + 1}" aria-label="Increase ${escapeHtml(l.name)} ${escapeHtml(l.modifiers.map((m) => m.name).join(" "))}" ${l.quantity >= 10 || t.count >= 20 ? "disabled" : ""}>+</button></div><strong>${money(l.unitCents * l.quantity)}</strong><button class="remove-item" data-remove="${l.key}" aria-label="Remove ${escapeHtml(l.name)} ${escapeHtml(l.modifiers.map((m) => m.name).join(" "))}">Remove</button></div></article>`).join("") : '<p class="empty-basket">Your basket is empty. Add a dish from the menu.</p>'}<label class="kitchen-note" for="kitchenNote">Kitchen note <span>optional</span></label><textarea id="kitchenNote" maxlength="120" rows="2" placeholder="e.g. no onions">${escapeHtml(order.note)}</textarea><span class="phone-label">Waiter tip · optional</span><div class="phone-tip">${[0, 10, 12, 15].map((n) => `<button data-order-tip="${n}" aria-pressed="${order.tipPercent === n}">${n === 0 ? "No tip" : n + "%"}</button>`).join("")}</div><div class="receipt-mini"><div><span>Food & drinks</span><b>${money(t.principal)}</b></div><div><span>Tip</span><b>${money(t.tip)}</b></div><div><strong>Total</strong><strong>${money(t.total)}</strong></div></div><details class="payment-scenario"><summary>Demo payment</summary><label for="paymentScenario">Test an outcome</label><select id="paymentScenario"><option value="success" ${paymentOutcome === "success" ? "selected" : ""}>Payment approved</option><option value="failed" ${paymentOutcome === "failed" ? "selected" : ""}>Payment declined</option></select><small>No money moves in either scenario.</small></details><div class="order-dock"><p id="orderStatus" role="status">${escapeHtml(orderNotice || "Demo checkout · no payment taken")}</p><button class="cta phone-cta" id="submitOrder" ${t.count && !store.busy && ["database", "preview"].includes(store.mode) ? "" : "disabled"}>${store.busy ? "Saving order…" : store.state.pending ? "Check & retry same order" : "Place demo order"} <span>${money(t.total)}</span></button></div>`;
    } else {
      const r = store.state.receipt;
      const failed = r.status === "PAYMENT_FAILED";
      html = `<div class="scan-card order-success"><div class="success-orb">${failed ? "!" : r.status === "READY" ? "✓" : "•"}</div><h3>${failed ? "Payment declined." : r.status === "READY" ? "Ready for you." : r.status === "PREPARING" ? "In the kitchen." : "Order received."}</h3><p>${failed ? "Your basket is saved. Nothing has been sent to the kitchen." : "Your demo order is " + statusLabel(r.status).toLowerCase() + "."}</p>${failed ? "" : `<div class="order-progress" aria-label="Order status: ${statusLabel(r.status)}">${["RECEIVED", "PREPARING", "READY"].map((v, i) => `<span class="${i <= ["RECEIVED", "PREPARING", "READY"].indexOf(r.status) ? "complete" : ""}">${statusLabel(v)}</span>`).join("")}</div>`}<div class="receipt-mini"><div><span>Table</span><b>${escapeHtml(r.table)}</b></div><div><span>Reference</span><b>${escapeHtml(r.reference)}</b></div><div><span>${r.count} item${r.count === 1 ? "" : "s"}</span><b>${money(r.principal)}</b></div><div><span>Tip</span><b>${money(r.tip)}</b></div><div><strong>Order total</strong><strong>${money(r.total)}</strong></div><small>${failed ? "No payment confirmed" : "✓ Simulated payment approved"}</small></div><p id="orderStatus" role="status">${escapeHtml(orderNotice)}</p>${failed ? '<button class="cta phone-cta" id="retryPayment">Retry demo payment →</button>' : '<button class="cta phone-cta" id="seeOrder">See the restaurant ticket →</button>'}<button class="order-back" id="newOrder">Start a new demo order</button><p class="phone-footnote">${r.storage === "database" ? "Saved in the demo database." : "Saved on this device only."} No real payment or kitchen dispatch.</p></div>`;
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
      $("#kitchenNote").addEventListener("input", (e) => {
        try {
          order.setNote(e.target.value);
          store.draft(order);
        } catch (error) {
          $("#orderStatus").textContent = error.message;
        }
      });
    if ($("#paymentScenario"))
      $("#paymentScenario").addEventListener("change", (e) => {
        paymentOutcome = e.target.value;
      });
    if ($("#submitOrder"))
      $("#submitOrder").addEventListener("click", async () => {
        if (store.busy) return;
        try {
          orderNotice = "Saving your demo order…";
          const saving = store.submit(order, paymentOutcome);
          renderPhone();
          const receipt = await saving;
          if (!receipt) return;
          orderStep = 2;
          outcome = "normal";
          orderNotice = "";
        } catch (e) {
          orderNotice = e.message;
        }
        renderPhone();
      });
    if (store.state.pending || store.busy)
      $$(
        "#phoneContent button, #phoneContent input, #phoneContent textarea, #phoneContent select",
      ).forEach((el) => {
        if (el.id !== "submitOrder") el.disabled = true;
      });
    if ($("#retryPayment"))
      $("#retryPayment").addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        try {
          await store.update(store.state.receipt.id, "RECEIVED", true);
          orderNotice = "";
        } catch (error) {
          orderNotice = error.message;
        }
        renderPhone();
      });
    if ($("#seeOrder")) $("#seeOrder").addEventListener("click", () => show(2));
    if ($("#newOrder"))
      $("#newOrder").addEventListener("click", () => {
        try {
          store.newOrder();
        } catch (e) {
          orderNotice = e.message;
          renderPhone();
          return;
        }
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
    try {
      store.newOrder();
    } catch (e) {
      orderNotice = e.message;
      renderPhone();
      return;
    }
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
    const ordering = journey === "order";
    $("#orderOperations").hidden = !ordering;
    $("#paymentOperations").hidden = ordering;
    $("#operations-title").textContent = ordering
      ? "Every order. One clear view."
      : "Confidence on both sides of the table.";
    $("#operations .lead").textContent = ordering
      ? "From received to ready, the guest and the restaurant see the same progress."
      : "A guest’s payment is only complete when the restaurant can account for it.";
    if (ordering) {
      renderQueue();
      return;
    }
    const receipt = null;
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
      `<span class="check ${pending ? "pending" : ""}">${pending ? "!" : "✓"}</span><div><b>${pending ? "Waiting for the till" : "Payment recorded on the till"}</b><p>${pending ? "Payment received. The till will update when it reconnects." : "Table 07 shows the same payment."}</p></div>`;
    $("#opsAction").classList.toggle("pending", pending);
    $("#opsAction").textContent = pending
      ? "Staff can follow up. The guest does not need to pay again."
      : "Everything matches. No follow-up needed.";
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
  function ticketCard(r) {
    const next =
      r.status === "RECEIVED"
        ? "PREPARING"
        : r.status === "PREPARING"
          ? "READY"
          : null;
    return `<article class="queue-ticket ${store.state.receipt?.id === r.id ? "current-ticket" : ""}"><div class="ticket-top"><strong>Table ${escapeHtml(r.table)}</strong><small>${new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div><span class="ticket-reference">${escapeHtml(r.reference)}</span>${r.lines.map((l) => `<p><b>${l.quantity} × ${escapeHtml(l.name)}</b>${l.modifiers.length ? `<small>${escapeHtml(l.modifiers.map((m) => m.name).join(", "))}</small>` : ""}</p>`).join("")}${r.note ? `<p class="ticket-note">${escapeHtml(r.note)}</p>` : ""}<div class="ticket-total"><span>${r.status === "PAYMENT_FAILED" ? "Payment needed" : "Demo payment approved"}</span><b>${money(r.total)}</b></div>${next ? `<button class="cta" data-order-id="${r.id}" data-order-next="${next}">${next === "PREPARING" ? "Start preparing" : "Mark ready"} →</button>` : r.status === "READY" ? '<span class="ready-label">✓ Ready for collection</span>' : "<small>Not released to the kitchen. Retry from the guest receipt.</small>"}</article>`;
  }
  async function renderQueue() {
    if (queueLoading) return;
    queueLoading = true;
    try {
      queueOrders = await store.queue();
      $("#queueSummary").textContent =
        store.mode === "database"
          ? "The Olive Room · connected demo"
          : "Device-only preview · saved in this browser";
      const fingerprint =
        JSON.stringify(queueOrders) + (store.state.receipt?.id || "");
      const refreshed = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · Demo payments only. No real kitchen dispatch.`;
      if (fingerprint === queueFingerprint) {
        $("#queueStatus").textContent = refreshed;
        return;
      }
      queueFingerprint = fingerprint;
      const attentionOpen = $("#failedOrders details")?.open;
      $("#kitchenQueue").innerHTML = ["RECEIVED", "PREPARING", "READY"]
        .map((status) => {
          const rows = queueOrders.filter((r) => r.status === status);
          return `<section class="queue-column"><h3><span class="queue-dot ${status.toLowerCase()}"></span>${statusLabel(status)} <span>${rows.length}</span></h3>${rows.length ? rows.map(ticketCard).join("") : '<div class="queue-empty">' + (status === "RECEIVED" ? "New orders appear here." : status === "PREPARING" ? "Start preparing a received order." : "Ready orders appear here.") + "</div>"}</section>`;
        })
        .join("");
      const failed = queueOrders.filter((r) => r.status === "PAYMENT_FAILED");
      $("#failedOrders").innerHTML = failed.length
        ? `<details class="failed-orders" ${attentionOpen ? "open" : ""}><summary>Payment attention · ${failed.length}</summary><div class="failed-grid">${failed.map(ticketCard).join("")}</div></details>`
        : "";
      $("#queueStatus").textContent = refreshed;
      if (store.state.receipt) {
        const latest = queueOrders.find((r) => r.id === store.state.receipt.id);
        if (latest) {
          store.state.receipt = latest;
          store.save();
        }
      }
      $$("[data-order-next]").forEach((b) =>
        b.addEventListener("click", async () => {
          b.disabled = true;
          try {
            await store.update(b.dataset.orderId, b.dataset.orderNext);
            await renderQueue();
          } catch (e) {
            $("#queueStatus").textContent = e.message;
            b.disabled = false;
          }
        }),
      );
    } catch (e) {
      $("#queueStatus").textContent =
        e.message +
        (queueOrders.length ? " Showing the last loaded queue." : "");
    } finally {
      queueLoading = false;
    }
  }
  $("#refreshQueue").addEventListener("click", renderQueue);
  $("#openPresenter").addEventListener("click", () => {
    closeNavigation();
    $("#presenterConnection").textContent =
      store.mode === "database"
        ? "Connected demo: database storage is active. No real payments."
        : "Device-only preview: use the local server to demonstrate database persistence.";
    $("#presenterDialog").showModal();
  });
  $("#closePresenter").addEventListener("click", () =>
    $("#presenterDialog").close(),
  );
  $("#startPresentation").addEventListener("click", () => {
    $("#presenterDialog").close();
    show(0);
  });
  async function startOrders() {
    try {
      if (store.state.draft) order = restoreBasket(store.state.draft);
      orderStep = store.state.receipt
        ? 2
        : store.state.pending || order.totals().count
          ? 1
          : 0;
      await store.init(location.protocol === "file:");
      if (store.state.receipt) orderStep = 2;
      $("#connectionStatus").textContent =
        store.mode === "database"
          ? "Connected demo · orders saved in the database"
          : "Device-only preview · orders saved in this browser";
      $("#connectionHelp").hidden = true;
    } catch (e) {
      orderNotice = e.message;
      $("#connectionStatus").textContent = e.message;
      $("#connectionHelp").hidden = false;
    }
    renderPhone();
    if (slide === 2) renderOps();
  }
  $("#reconnect").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try {
      await store.connect($("#operatorKey").value);
      $("#operatorKey").value = "";
      await startOrders();
    } catch (error) {
      $("#connectionStatus").textContent = error.message;
    } finally {
      e.currentTarget.disabled = false;
    }
  });
  setInterval(async () => {
    if (
      document.hidden ||
      store.busy ||
      !["database", "preview"].includes(store.mode)
    )
      return;
    if (slide === 2 && journey === "order") await renderQueue();
    if (
      slide === 1 &&
      orderStep === 2 &&
      journey === "order" &&
      store.state.receipt
    ) {
      try {
        const previous = store.state.receipt;
        const current =
          store.mode === "database"
            ? await store.api("/api/orders/" + previous.id)
            : (await store.queue()).find((r) => r.id === previous.id);
        if (current && current.status !== previous.status) {
          store.state.receipt = current;
          store.save();
          orderNotice = "";
          renderPhone();
        }
      } catch (e) {
        const status = $("#orderStatus");
        if (status) status.textContent = e.message;
      }
    }
  }, 5000);
  $("#readiness").addEventListener("click", () =>
    $("#readinessDialog").showModal(),
  );
  $("#closeDialog").addEventListener("click", () =>
    $("#readinessDialog").close(),
  );
  startOrders();
  renderPhone();
  show(Math.max(0, ids.indexOf(location.hash.slice(1))));
})();
window.addEventListener("load", () =>
  window.scrollTo({ top: 0, behavior: "instant" }),
);
