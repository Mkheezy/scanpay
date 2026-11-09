// Shared demo menu and pricing model. No POS or payment requests are made here.
export const MENU = Object.freeze([
  Object.freeze({
    id: "burger",
    name: "Groundwork Wagyu Burger",
    description: "Wagyu patty, aged cheddar, brioche and skin-on fries.",
    cents: 18500,
    modifiers: Object.freeze(
      [
        { id: "double", name: "Double patty", cents: 7500 },
        { id: "truffle", name: "Truffle fries", cents: 3000 },
      ].map(Object.freeze),
    ),
  }),
  Object.freeze({
    id: "bowl",
    name: "Roasted vegetable bowl",
    description: "Seasonal vegetables, grains and lemon dressing.",
    cents: 14500,
    modifiers: Object.freeze([]),
  }),
  Object.freeze({
    id: "lemonade",
    name: "House lemonade",
    description: "Fresh lemon, sparkling water and mint.",
    cents: 3500,
    modifiers: Object.freeze([]),
  }),
]);
const assert = (value, message) => {
  if (!value) throw Error(message);
};
export class DemoOrder {
  #lines = new Map();
  #tipPercent = 10;
  #note = "";
  #receipt = null;
  get receipt() {
    return this.#receipt;
  }
  get tipPercent() {
    return this.#tipPercent;
  }
  get note() {
    return this.#note;
  }
  get lines() {
    return [...this.#lines.values()].map((line) => ({
      ...line,
      modifiers: line.modifiers.map((m) => ({ ...m })),
    }));
  }
  #editable() {
    assert(!this.#receipt, "Start a new order to make changes.");
  }
  add(itemId, modifierIds = []) {
    this.#editable();
    const item = MENU.find((item) => item.id === itemId);
    assert(item, "Choose an item from the menu.");
    assert(
      Array.isArray(modifierIds) &&
        new Set(modifierIds).size === modifierIds.length,
      "Invalid modifiers.",
    );
    const modifiers = modifierIds
      .map((id) => {
        const m = item.modifiers.find((m) => m.id === id);
        assert(m, "Modifier is not available for this item.");
        return m;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    const key = [item.id, ...modifiers.map((m) => m.id)].join(":");
    const old = this.#lines.get(key);
    const quantity = (old?.quantity || 0) + 1;
    assert(
      quantity <= 10 && this.totals().count < 20,
      "Maximum 10 of one item and 20 items per demo order.",
    );
    this.#lines.set(key, {
      key,
      itemId: item.id,
      name: item.name,
      modifiers,
      unitCents: item.cents + modifiers.reduce((s, m) => s + m.cents, 0),
      quantity,
    });
    return key;
  }
  quantity(key, value) {
    this.#editable();
    const line = this.#lines.get(key);
    assert(line, "Item is not in the basket.");
    assert(
      Number.isInteger(value) && value >= 0 && value <= 10,
      "Quantity must be between 0 and 10.",
    );
    assert(
      this.totals().count - line.quantity + value <= 20,
      "Maximum 20 items per demo order.",
    );
    if (value === 0) this.#lines.delete(key);
    else this.#lines.set(key, { ...line, quantity: value });
  }
  setTip(percent) {
    this.#editable();
    assert([0, 10, 12, 15].includes(percent), "Choose a listed tip.");
    this.#tipPercent = percent;
  }
  setNote(note) {
    this.#editable();
    assert(
      typeof note === "string" && note.length <= 120,
      "Keep the kitchen note within 120 characters.",
    );
    this.#note = note.trim();
  }
  totals() {
    const lines = this.lines;
    const principal = lines.reduce((n, l) => n + l.unitCents * l.quantity, 0);
    const tip = Math.round((principal * this.#tipPercent) / 100);
    return {
      principal,
      tip,
      total: principal + tip,
      count: lines.reduce((n, l) => n + l.quantity, 0),
    };
  }
  submit() {
    if (this.#receipt) return this.#receipt;
    const totals = this.totals();
    assert(totals.count > 0, "Add an item before placing an order.");
    const lines = this.lines.map((l) =>
      Object.freeze({
        ...l,
        modifiers: Object.freeze(l.modifiers.map(Object.freeze)),
      }),
    );
    this.#receipt = Object.freeze({
      reference: "DEMO-007",
      table: "07",
      ...totals,
      note: this.#note,
      lines: Object.freeze(lines),
      simulated: true,
      status: "ORDER_RECEIVED",
    });
    return this.#receipt;
  }
}
