import { DemoOrder } from "./order-model.mjs";

export const ORDER_STORAGE_KEY = "groundwork-orders-v1";
export function basketPayload(model, paymentOutcome = "success") {
  return {
    lines: model.lines.map((l) => ({
      itemId: l.itemId,
      modifiers: l.modifiers.map((m) => m.id),
      quantity: l.quantity,
    })),
    note: model.note,
    tipPercent: model.tipPercent,
    paymentOutcome,
  };
}
export function restoreBasket(data) {
  const model = new DemoOrder();
  if (!data) return model;
  for (const l of data.lines)
    for (let n = 0; n < l.quantity; n++) model.add(l.itemId, l.modifiers);
  model.setNote(data.note);
  model.setTip(data.tipPercent);
  return model;
}
export class OrderStore {
  constructor({
    storage = localStorage,
    queueStorage = storage,
    request = globalThis.fetch.bind(globalThis),
    uuid = () => crypto.randomUUID(),
  } = {}) {
    this.storage = storage;
    this.queueStorage = queueStorage;
    this.request = request;
    this.uuid = uuid;
    this.mode = "connecting";
    this.busy = false;
    this.state = { orders: [] };
    try {
      this.state = JSON.parse(storage.getItem(ORDER_STORAGE_KEY)) || this.state;
    } catch {
      this.storageError = true;
    }
  }
  save() {
    if (this.storageError)
      throw Error(
        "Browser storage is unavailable. Allow site storage before ordering.",
      );
    try {
      this.storage.setItem(ORDER_STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      throw Error(
        "Unable to save this order safely. Allow site storage and try again.",
      );
    }
  }
  draft(model) {
    this.state.draft = basketPayload(model);
    this.save();
  }
  async api(path, body, key) {
    let response;
    try {
      response = await this.request(path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Groundwork": "1",
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw Error(
        "Connection interrupted. Retry to check the same order safely.",
      );
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw Error(
        "Restaurant connection is unavailable. Your order has not been confirmed.",
      );
    }
    if (!response.ok) {
      const e = Error(data.message || "Unable to complete this request.");
      e.status = response.status;
      throw e;
    }
    return data;
  }
  async init(filePreview = false) {
    if (filePreview) {
      this.mode = "preview";
      return;
    }
    const health = await this.request("/api/health", {
      signal: AbortSignal.timeout(5000),
    });
    if (health.status === 404 && this.state.mode !== "database") {
      this.mode = "preview";
      return;
    }
    if (!health.ok)
      throw Error("Restaurant connection is unavailable. Please reconnect.");
    const h = await health.json();
    if (!h.demo || h.provider !== "mock")
      throw Error("Demo ordering is unavailable on this server.");
    this.mode = "database";
    this.state.mode = "database";
    this.save();
    try {
      await this.queue();
    } catch (e) {
      if (e.status !== 401) throw e;
      await this.connect();
    }
    if (this.state.receipt?.storage === "database")
      this.state.receipt = await this.api(
        "/api/orders/" + this.state.receipt.id,
      );
    // Recover a lost response using exactly the request already saved before submission.
    if (this.state.pending) await this.submit();
    this.save();
  }
  async connect(accessKey = "") {
    await this.api("/api/demo/start", { accessKey });
    this.mode = "database";
    this.state.mode = "database";
    this.save();
    return this.queue();
  }
  async submit(model, paymentOutcome = "success") {
    if (this.busy) return null;
    if (!["database", "preview"].includes(this.mode))
      throw Error("Wait for the restaurant connection before ordering.");
    this.busy = true;
    try {
      if (!this.state.pending) {
        if (!model?.totals().count)
          throw Error("Add an item before placing an order.");
        this.state.pending = {
          key: this.uuid(),
          body: basketPayload(model, paymentOutcome),
        };
      }
      this.save(); // The idempotency key must survive a reload before any network request.
      const p = this.state.pending;
      let receipt;
      if (this.mode === "database")
        receipt = await this.api("/api/orders", p.body, p.key);
      else {
        await this.queue();
        receipt = this.state.orders.find((r) => r.id === p.key);
        if (!receipt) {
          const m = restoreBasket(p.body);
          receipt = {
            ...m.submit(),
            id: p.key,
            reference: "PREVIEW-" + p.key.slice(0, 6).toUpperCase(),
            status:
              p.body.paymentOutcome === "failed"
                ? "PAYMENT_FAILED"
                : "RECEIVED",
            paymentStatus:
              p.body.paymentOutcome === "failed" ? "FAILED" : "SIMULATED_PAID",
            storage: "device",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          this.state.orders.unshift(receipt);
          this.queueStorage.setItem(
            ORDER_STORAGE_KEY + "-queue",
            JSON.stringify(this.state.orders),
          );
        }
      }
      this.state.receipt = receipt;
      this.state.pending = null;
      this.save();
      return receipt;
    } finally {
      this.busy = false;
    }
  }
  async queue() {
    if (this.mode === "database")
      return (await this.api("/api/merchant/orders")).orders;
    if (this.mode !== "preview") throw Error("Connecting to the restaurant…");
    const stored = JSON.parse(
      this.queueStorage.getItem(ORDER_STORAGE_KEY + "-queue"),
    );
    if (stored) this.state.orders = stored;
    return this.state.orders;
  }
  async update(orderId, status, retry = false) {
    let receipt;
    if (this.mode === "database")
      receipt = await this.api(
        retry
          ? `/api/orders/${orderId}/retry-payment`
          : `/api/merchant/orders/${orderId}/status`,
        retry ? {} : { status },
      );
    else if (this.mode === "preview") {
      await this.queue();
      receipt = this.state.orders.find((r) => r.id === orderId);
      if (!receipt) throw Error("Order not found. Refresh the queue.");
      if (retry) {
        if (receipt.status === "PAYMENT_FAILED") {
          receipt.status = "RECEIVED";
          receipt.paymentStatus = "SIMULATED_PAID";
        }
      } else if (
        (receipt.status === "RECEIVED" && status === "PREPARING") ||
        (receipt.status === "PREPARING" && status === "READY")
      )
        receipt.status = status;
      else if (receipt.status !== status)
        throw Error("Refresh the queue before updating this order.");
      receipt.updatedAt = Date.now();
      this.queueStorage.setItem(
        ORDER_STORAGE_KEY + "-queue",
        JSON.stringify(this.state.orders),
      );
    } else throw Error("Restaurant connection is unavailable.");
    if (this.state.receipt?.id === orderId) this.state.receipt = receipt;
    this.save();
    return receipt;
  }
  newOrder() {
    if (this.state.pending)
      throw Error("Resolve the pending order before starting another.");
    this.state.receipt = null;
    this.state.draft = null;
    this.save();
  }
}
