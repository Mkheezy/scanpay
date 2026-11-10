const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const money = (n) =>
  "R" + (n / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let online = false,
  role = "",
  provider = "mock",
  bill = null,
  dashboard = null,
  payment = null,
  mode = "full",
  tip = 0,
  people = 2,
  custom = 25000,
  busy = false,
  tableId = null,
  view = "overview";
let requestKey = null,
  refreshing = false;
const savedPayment = sessionStorage.getItem("gw_payment");
let paymentId =
  new URLSearchParams(location.search).get("payment") || savedPayment;
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").style.display = "none"), 4500);
}
async function api(path, method = "GET", body, key) {
  const res = await fetch("/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Groundwork": "1",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d;
  try {
    d = await res.json();
  } catch {
    throw Error(
      "Backend unavailable. Start the included server to use the live demo.",
    );
  }
  if (!res.ok) {
    const e = Error(d.message || "Request failed");
    e.code = d.code;
    e.status = res.status;
    throw e;
  }
  return d;
}
const sandboxNavigation = $("#sandboxNavigation");
$("#sandboxMenu").onclick = () => {
  sandboxNavigation.showModal();
  $("#sandboxMenu").setAttribute("aria-expanded", "true");
};
$("#closeSandboxMenu").onclick = () => sandboxNavigation.close();
sandboxNavigation.addEventListener("close", () =>
  $("#sandboxMenu").setAttribute("aria-expanded", "false"),
);
function navigate(v) {
  if (sandboxNavigation.open) sandboxNavigation.close();
  view = ["overview", "demo", "build"].includes(v) ? v : "overview";
  $("#sandboxChapter").textContent = {
    overview: "Overview",
    demo: "Live demo",
    build: "Under the hood",
  }[view];
  $$(".view").forEach((el) => el.classList.toggle("active", el.id === view));
  $$("nav button").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view),
  );
  if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
  if (view === "demo") {
    if (online) connect();
    else {
      $("#demoGate").hidden = false;
      $("#demoContent").hidden = true;
    }
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$("[data-view]").forEach((b) => (b.onclick = () => navigate(b.dataset.view)));
$$("[data-open-demo]").forEach((b) => (b.onclick = () => navigate("demo")));
$("#explain").onclick = () =>
  $("#story").scrollIntoView({ behavior: "smooth" });
$("#present").onclick = () => {
  sandboxNavigation.close();
  if (document.fullscreenElement) document.exitFullscreen();
  else
    document.documentElement
      .requestFullscreen()
      .catch(() => toast("Use your browser’s fullscreen option to present."));
};
const stories = [
  {
    who: "THE GUEST → THE RESTAURANT",
    title: "The right bill, at the right table.",
    copy: "A table QR opens an itemised bill from the restaurant’s POS. The guest sees what is owing without downloading an app.",
    call: "Table codes identify a table. A scoped session identifies the current visit.",
    a: ["SCAN", "▦", "Table 07"],
    b: ["BILL", "R425", "From the POS"],
  },
  {
    who: "TAVLO → THE BILL",
    title: "Choose a share. Keep every cent.",
    copy: "Pay the whole balance, split the remaining amount equally, or choose a custom amount. The backend reserves that share before starting checkout.",
    call: "If two guests try to pay the last amount, the database allows only the available balance.",
    a: ["SHARE", "R250", "Guest chooses"],
    b: ["RESERVED", "✓", "Held in database"],
  },
  {
    who: "PAYMENT PROVIDER → TAVLO",
    title: "A redirect is not proof of payment.",
    copy: "The provider hosts checkout. Tavlo checks the payment reference, amount and currency on the server before marking funds as verified.",
    call: "Delayed confirmation stays pending. Guests are told not to pay again.",
    a: ["CHECKOUT", "→", "Provider hosted"],
    b: ["VERIFIED", "✓", "Server checked"],
  },
  {
    who: "TAVLO → THE RESTAURANT POS",
    title: "The till gets the same payment.",
    copy: "A durable job posts the verified payment to the original check. If the POS is unavailable, the merchant sees an exception and the worker retries.",
    call: "A repeated callback never creates a second payment. A missing POS confirmation stays visible.",
    a: ["FUNDS", "R250", "Verified"],
    b: ["POS", "✓", "Posted once"],
  },
];
function story(i) {
  const s = stories[i];
  $$("[data-step]").forEach((b) =>
    b.classList.toggle("selected", Number(b.dataset.step) === i),
  );
  $("#storyWho").textContent = s.who;
  $("#storyTitle").textContent = s.title;
  $("#storyCopy").textContent = s.copy;
  $("#storyCallout").textContent = s.call;
  $("#storyGraphic").innerHTML =
    `<div class="graphic"><div class="graphic-box"><small>${s.a[0]}</small><strong>${s.a[1]}</strong><small>${s.a[2]}</small></div><span class="graphic-arrow">→</span><div class="graphic-box dark"><small>${s.b[0]}</small><strong>${s.b[1]}</strong><small>${s.b[2]}</small></div></div>`;
}
$$("[data-step]").forEach(
  (b) => (b.onclick = () => story(Number(b.dataset.step))),
);
story(0);
async function connect() {
  if (busy || refreshing) return;
  try {
    await refresh(true);
  } catch (e) {
    if (e.status === 401) {
      try {
        await api("/demo/start", "POST", {});
        paymentId = null;
        sessionStorage.removeItem("gw_payment");
        await refresh(true);
      } catch (error) {
        if (["DEMO_KEY_REQUIRED", "DEMO_DISABLED"].includes(error.code)) {
          $("#login").showModal();
        } else toast(error.message);
      }
    } else if (e.code === "VISIT_EXPIRED") {
      paymentId = null;
      await api("/demo/start", "POST", {});
      await refresh(true);
    } else toast(e.message);
  }
}
$("#loginSubmit").onclick = async () => {
  try {
    await api("/merchant/login", "POST", { accessKey: $("#accessKey").value });
    $("#accessKey").value = "";
    $("#login").close();
    await refresh(true);
  } catch (e) {
    toast(e.message);
  }
};
async function refresh(force = false) {
  if (refreshing) return;
  refreshing = true;
  try {
    const d = await api("/bill");
    bill = d.bill;
    role = d.role;
    provider = d.provider;
    tableId = bill.id;
    $("#demoGate").hidden = true;
    $("#demoContent").hidden = false;
    const admin = role !== "guest";
    document.body.classList.toggle("guest-mode", !admin);
    $(".rail-col").hidden = !admin;
    $("#newVisit").hidden = !admin;
    $(".desk-col").hidden = !admin;
    $(".bottom-grid").hidden = !admin;
    $(".qr-section").hidden = !admin;
    if (paymentId) {
      try {
        payment = await api("/payments/" + paymentId);
      } catch (e) {
        if (e.status === 404) {
          paymentId = null;
          payment = null;
          sessionStorage.removeItem("gw_payment");
        } else throw e;
      }
    }
    if (admin) dashboard = await api("/merchant/dashboard");
    if (force || paymentId || !$("#pay")) renderGuest();
    renderPipeline();
    if (admin) {
      renderMerchant();
      renderLedger();
      renderEvents();
      if (force) await renderQR();
    }
  } finally {
    refreshing = false;
  }
}
function value() {
  if (!bill) return null;
  const remaining = bill.available_cents,
    amount =
      mode === "full"
        ? remaining
        : mode === "equal"
          ? Math.floor(remaining / people) + (remaining % people > 0 ? 1 : 0)
          : custom;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining)
    return null;
  const t = Math.round((amount * tip) / 100);
  return { amount, tip: t, total: amount + t };
}
function renderGuest() {
  if (paymentId && payment) return renderResult();
  const q = value();
  $("#guestBody").innerHTML =
    `<h4>Your table bill</h4>${bill.lines.map((l) => `<div class="bill-line"><span><small>${l.quantity}×</small>${esc(l.name)}</span><strong>${money(l.quantity * l.cents)}</strong></div>`).join("")}<div class="bill-total"><span>Table total</span><span>${money(bill.total_cents)}</span></div><p class="micro">Venue tax included</p><div class="available"><span>Available to pay</span><b>${money(bill.available_cents)}</b></div>${
      bill.available_cents > 0
        ? `<span class="field-label">Choose your share</span><div class="segments">${[
            ["full", "Full balance"],
            ["equal", "Split equally"],
            ["custom", "My amount"],
          ]
            .map(
              ([id, label]) =>
                `<button data-mode="${id}" class="${mode === id ? "selected" : ""}" aria-pressed="${mode === id}">${label}</button>`,
            )
            .join(
              "",
            )}</div>${mode === "equal" ? `<label class="field-label">People sharing this balance<select id="people">${[2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${n === people ? "selected" : ""}>${n} people</option>`).join("")}</select></label><p class="micro">You pay the first share of the remaining balance. Extra cents go to earlier shares.</p>` : mode === "custom" ? `<label class="field-label">Bill amount in rand<input id="amount" type="number" step="0.01" min="0.01" max="${bill.available_cents / 100}" value="${(custom / 100).toFixed(2)}"></label>` : ""}<span class="field-label">Leave a tip · optional</span><div class="tips">${[0, 10, 12, 15].map((n) => `<button data-tip="${n}" class="${tip === n ? "selected" : ""}" aria-pressed="${tip === n}">${n ? n + "%" : "No tip"}</button>`).join("")}</div>${provider === "paystack" ? '<label class="field-label">Email for provider checkout<input id="email" type="email" placeholder="you@example.com"></label>' : ""}<div class="amount-row"><span>Your total</span><strong id="total">${q ? money(q.total) : "—"}</strong></div><button class="primary" id="pay" ${q ? "" : "disabled"}>Continue to checkout <span>→</span></button><p class="micro" id="quoteHint">${q ? money(q.amount) + " bill + " + money(q.tip) + " tip" : "Enter a valid amount within the remaining balance."}</p><p class="micro">${provider === "mock" ? "Mock checkout · no money moves" : "Paystack test mode · test cards only"}</p>`
        : '<p class="micro">The full bill is paid or reserved. Pending payments must be resolved before another attempt.</p>'
    }`;
  $$("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        mode = b.dataset.mode;
        requestKey = null;
        renderGuest();
      }),
  );
  $$("[data-tip]").forEach(
    (b) =>
      (b.onclick = () => {
        tip = Number(b.dataset.tip);
        requestKey = null;
        renderGuest();
      }),
  );
  if ($("#people"))
    $("#people").onchange = (e) => {
      people = Number(e.target.value);
      requestKey = null;
      renderGuest();
    };
  if ($("#amount"))
    $("#amount").oninput = (e) => {
      const raw = e.target.value;
      custom = /^\d+(\.\d{1,2})?$/.test(raw)
        ? Math.round(Number(raw) * 100)
        : NaN;
      requestKey = null;
      const q = value();
      $("#total").textContent = q ? money(q.total) : "—";
      $("#quoteHint").textContent = q
        ? money(q.amount) + " bill + " + money(q.tip) + " tip"
        : "Choose a valid available amount.";
      $("#pay").disabled = !q;
    };
  if ($("#pay")) $("#pay").onclick = pay;
}
async function pay() {
  if (busy) return;
  busy = true;
  $("#pay").disabled = true;
  requestKey = requestKey || crypto.randomUUID();
  try {
    const p = await api(
      "/payments",
      "POST",
      {
        mode,
        tipPercent: tip,
        revision: bill.revision,
        ...(mode === "custom" ? { amountCents: custom } : {}),
        ...(mode === "equal" ? { people } : {}),
        ...(provider === "paystack" ? { email: $("#email").value } : {}),
      },
      requestKey,
    );
    paymentId = p.id;
    sessionStorage.setItem("gw_payment", p.id);
    sessionStorage.setItem("gw_scenario", $("#scenario").value);
    if (p.checkout_url) {
      location.href = p.checkout_url;
      return;
    }
    toast(
      "Checkout could not be confirmed. The payment remains reserved for investigation.",
    );
    payment = p;
    renderGuest();
    renderPipeline();
  } catch (e) {
    toast(e.message);
    if (e.code === "STALE_BILL" || e.code === "AMOUNT_UNAVAILABLE")
      requestKey = null;
    await refresh(true);
  } finally {
    busy = false;
    if ($("#pay")) $("#pay").disabled = false;
  }
}
function status(p) {
  if (p.review_reason === "PROVIDER_MISMATCH")
    return [
      "!",
      "Amount mismatch",
      "The provider returned a different amount. This payment is held for review. Do not pay again.",
      "red",
    ];
  if (p.funds_state === "FAILED")
    return [
      "×",
      "Payment declined",
      "The provider confirmed failure. Your reserved share has been released.",
      "red",
    ];
  if (p.funds_state === "REVERSED")
    return [
      "!",
      "Reversal needs review",
      "The provider reported a reversal. Staff need to reconcile the bill before another payment.",
      "amber",
    ];
  if (p.pos_state === "POSTED")
    return [
      "✓",
      "Your share is settled",
      "Payment verified and recorded once in the demo POS.",
      "green",
    ];
  if (p.funds_state === "VERIFIED")
    return [
      "!",
      "Payment received",
      "The POS has not confirmed this payment yet. Staff can see the exception. Please do not pay again.",
      "amber",
    ];
  return [
    "…",
    "Checking your payment",
    "Your share is reserved while we wait for provider confirmation. Please do not pay again.",
    "amber",
  ];
}
function renderResult() {
  const p = payment,
    s = status(p);
  $("#guestBody").innerHTML =
    `<div class="result"><div class="result-icon ${s[3]}">${s[0]}</div><h4>${s[1]}</h4><p>${s[2]}</p><div class="result-summary"><div><span>Bill share</span><b>${money(p.amount_cents)}</b></div><div><span>Tip</span><b>${money(p.tip_cents)}</b></div><div><span>Total</span><b>${money(p.amount_cents + p.tip_cents)}</b></div></div><span class="tag ${s[3]}">${esc(p.funds_state)} / ${esc(p.pos_state)}</span><p class="micro">Reference ${esc(p.reference.slice(0, 15))}…<br>Sandbox only · not a receipt for real payment</p><button class="primary" id="backBill">Return to table bill →</button>${p.funds_state === "PENDING" ? '<button class="outline" id="checkAgain">Check provider status</button>' : ""}</div>`;
  $("#backBill").onclick = () => {
    paymentId = null;
    payment = null;
    requestKey = null;
    mode = "full";
    tip = 0;
    sessionStorage.removeItem("gw_payment");
    history.replaceState(null, "", location.pathname + "#demo");
    refresh(true);
  };
  if ($("#checkAgain"))
    $("#checkAgain").onclick = async () => {
      try {
        await api("/payments/" + p.id + "/verify", "POST", {});
        toast("Server verification queued.");
      } catch (e) {
        toast(e.message);
      }
    };
}
function renderPipeline() {
  const p = payment;
  const nodes = [
    [
      "1",
      "Table identified",
      bill
        ? "Visit bound to table " + bill.table_label
        : "Open an active table",
      bill ? "done" : "",
    ],
    [
      "2",
      "Share reserved",
      p
        ? money(p.amount_cents) + " held against this bill"
        : "Choose full, equal or custom",
      p ? "done" : "",
    ],
    [
      "3",
      "Payment verified",
      p
        ? p.funds_state === "VERIFIED"
          ? "Reference, amount & currency match"
          : p.funds_state === "FAILED"
            ? "Failure confirmed; share released"
            : "Waiting for server verification"
        : "Provider confirms the outcome",
      p
        ? p.funds_state === "VERIFIED"
          ? "done"
          : p.funds_state === "FAILED"
            ? "error"
            : "wait"
        : "",
    ],
    [
      "4",
      "Recorded in POS",
      p?.pos_state === "POSTED"
        ? "Exactly one matching POS payment"
        : p?.funds_state === "VERIFIED"
          ? "Posting job queued or retrying"
          : "Only after funds are verified",
      p?.pos_state === "POSTED"
        ? "done"
        : p?.funds_state === "VERIFIED"
          ? "wait"
          : "",
    ],
  ];
  $("#pipeline").innerHTML = nodes
    .map(
      ([n, title, copy, cls]) =>
        `<div class="pipe-node ${cls}"><span class="pipe-icon">${cls === "done" ? "✓" : n}</span><div class="pipe-copy"><b>${title}</b><small>${copy}</small></div></div>`,
    )
    .join("");
}
function renderMerchant() {
  const d = dashboard;
  $("#merchantBody").innerHTML =
    `<h3>The Olive Room</h3><span class="subtitle">All visits · persisted merchant ledger</span><div class="metrics"><div class="metric"><small>Verified bill payments</small><b>${money(d.verifiedCents)}</b></div><div class="metric"><small>Recorded in demo POS</small><b>${money(d.postedCents)}</b></div><div class="metric"><small>Verified tips</small><b>${money(d.tipCents)}</b></div><div class="metric ${d.exceptions ? "alert" : ""}"><small>Needs attention</small><b>${String(d.exceptions).padStart(2, "0")}</b></div></div><div class="smallhead" style="padding:0;border:0"><span>Payment posting progress</span><b style="font-size:11px">${d.verifiedCents ? Math.round((d.postedCents / d.verifiedCents) * 100) : 0}%</b></div><div class="balancebar"><span style="width:${d.verifiedCents ? Math.min(100, (d.postedCents / d.verifiedCents) * 100) : 0}%"></span></div><p class="micro">Verified principal matched to the POS, across demo visits.</p><div class="desk-note"><b>Current table visit</b><br>${money(bill.available_cents)} available · ${money(bill.reserved_cents)} paid or reserved.<br>Tips are tracked separately from the bill.</div><span class="tag green">PERSISTENT DATABASE</span> <span class="tag neutral">${esc(provider.toUpperCase())} PROVIDER</span>`;
}
function renderLedger() {
  const rows = dashboard.payments;
  $("#ledgerBody").innerHTML = rows.length
    ? `<div class="tablewrap"><table><thead><tr><th>REFERENCE / TABLE</th><th>BILL + TIP</th><th>STATUS / ACTION</th></tr></thead><tbody>${rows.map((p) => `<tr><td>${esc(p.reference.slice(0, 11))}…<small>${esc(p.check_id)}</small></td><td>${money(p.amount_cents)}<small>+ ${money(p.tip_cents)} tip</small></td><td><span class="tag ${status(p)[3]}">${p.pos_state === "POSTED" ? "SETTLED" : esc(p.review_reason || p.funds_state + " / " + p.pos_state)}</span><div class="row-actions">${p.pos_state !== "POSTED" && p.funds_state !== "FAILED" ? `<button class="textbutton" data-repair="${p.id}">${provider === "mock" ? "Restore mock & retry" : "Retry verification / sync"}</button>` : ""}${p.pos_state === "POSTED" && provider === "mock" ? `<button class="textbutton" data-replay="${p.id}">Replay event ×3</button>` : ""}${p.funds_state === "VERIFIED" ? `<button class="textbutton" data-refund="${p.id}" ${p.refunded_state === "REQUESTED" ? "disabled" : ""}>${p.refunded_state === "REQUESTED" ? "Refund requested" : "Request refund review"}</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>`
    : '<p class="empty">No payments yet. Pay a share on the left to create the first ledger entry.</p>';
  $$("[data-repair]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await api(
            provider === "mock"
              ? "/demo/payments/" + b.dataset.repair + "/repair"
              : "/merchant/payments/" + b.dataset.repair + "/retry",
            "POST",
            {},
          );
          toast("Reconciliation retry queued.");
          await refresh(true);
        } catch (e) {
          toast(e.message);
        }
      }),
  );
  $$("[data-replay]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          for (let n = 0; n < 3; n++)
            await api(
              "/demo/payments/" + b.dataset.replay + "/outcome",
              "POST",
              { outcome: "success" },
            );
          toast(
            "Three identical events delivered. The ledger still records one payment.",
          );
          await refresh(true);
        } catch (e) {
          toast(e.message);
        }
      }),
  );
  $$("[data-refund]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await api(
            "/merchant/payments/" + b.dataset.refund + "/refund-request",
            "POST",
            { reason: "Operator requested refund review from demonstration." },
          );
          toast(
            "Refund request recorded for review. No refund has been executed.",
          );
          await refresh(true);
        } catch (e) {
          toast(e.message);
        }
      }),
  );
}
function renderEvents() {
  const names = {
    RESERVED: "Share reserved",
    EVENT_RECEIVED: "Provider event stored",
    FUNDS_VERIFIED: "Payment verified",
    POS_POSTED: "POS payment confirmed",
    JOB_RETRY: "Retry scheduled",
    JOB_REVIEW: "Needs operator review",
    PAYMENT_FAILED: "Failed payment released",
    MANUAL_REVIEW: "Mismatch held for review",
    RETRY_REQUESTED: "Operator requested retry",
    REFUND_REQUESTED: "Refund review requested",
    QR_ROTATED: "Table code rotated",
    DEMO_ORDER_CREATED: "Demo order saved",
    DEMO_ORDER_PAYMENT_RETRIED: "Demo order payment retried",
    DEMO_ORDER_STATUS_CHANGED: "Kitchen status updated",
  };
  $("#events").innerHTML = dashboard.events.length
    ? dashboard.events
        .map(
          (e) =>
            `<div class="event"><span class="event-dot"></span><div><b>${esc(names[e.event] || e.event)}</b><p>${esc(e.detail)}</p></div><time>${new Date(Number(e.created_at)).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></div>`,
        )
        .join("")
    : '<p class="empty">The backend audit trail will appear here.</p>';
}
async function renderQR() {
  const tables = await api("/merchant/tables"),
    t = tables.find((t) => t.id === tableId);
  $("#qr").innerHTML =
    `<img src="/api/merchant/tables/${encodeURIComponent(tableId)}/qr.svg?v=${Date.now()}" alt="Working QR code for table ${esc(bill.table_label)}"><a href="/t/${encodeURIComponent(t.qr_code)}" target="_blank" rel="noreferrer">Open table ${esc(bill.table_label)} guest link ↗</a><a href="/api/merchant/tables/${encodeURIComponent(tableId)}/qr.svg" download="tavlo-table-${esc(bill.table_label)}.svg">Download QR ↓</a>`;
}
$("#refresh").onclick = () => refresh(true).catch((e) => toast(e.message));
$("#newVisit").onclick = async () => {
  try {
    await api("/demo/new-visit", "POST", {});
    paymentId = null;
    payment = null;
    sessionStorage.removeItem("gw_payment");
    history.replaceState(null, "", location.pathname + "#demo");
    mode = "full";
    tip = 0;
    await refresh(true);
    toast("New visit opened. Old guest sessions cannot see this bill.");
  } catch (e) {
    toast(e.message);
  }
};
$("#rotate").onclick = async () => {
  try {
    await api("/merchant/tables/" + tableId + "/rotate", "POST", {});
    await renderQR();
    toast("Table code rotated. Old scans are now revoked.");
  } catch (e) {
    toast(e.message);
  }
};
async function init() {
  try {
    const health = await api("/health");
    online = health.ok;
    $("#connection").textContent = "Sandbox connected";
    $("#connectionDot").classList.add("on");
    if (location.pathname.startsWith("/t/")) {
      await api(
        "/tables/" + encodeURIComponent(location.pathname.slice(3)) + "/claim",
        "POST",
        {},
      );
      paymentId = null;
      sessionStorage.removeItem("gw_payment");
      navigate("demo");
    } else navigate(location.hash.slice(1) || "overview");
    if (paymentId) navigate("demo");
  } catch (e) {
    $("#connection").textContent =
      "Presentation preview · backend not connected";
    online = false;
    if (location.pathname.startsWith("/t/")) {
      toast(e.message);
      navigate("demo");
    } else navigate(location.hash.slice(1) || "overview");
  }
}
window.addEventListener("hashchange", () => navigate(location.hash.slice(1)));
setInterval(() => {
  if (
    online &&
    view === "demo" &&
    !busy &&
    !$("#login").open &&
    !document.hidden
  )
    refresh(false).catch(() => {});
}, 2000);
init();
