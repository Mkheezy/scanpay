const pid = new URLSearchParams(location.search).get("payment");
const base = "/api/payments/" + encodeURIComponent(pid || "");
const money = (c) => "R" + (c / 100).toFixed(2);
const ret = "/sandbox.html?payment=" + encodeURIComponent(pid || "") + "#demo";
document.querySelector("#return").href = ret;
document.querySelector("#checkoutOutcome").value =
  sessionStorage.getItem("gw_scenario") || "success";
async function init() {
  const r = await fetch(base);
  const p = await r.json();
  if (!r.ok) throw Error(p.message);
  document.querySelector("#checkoutAmount").textContent = money(
    p.amount_cents + p.tip_cents,
  );
  document.querySelector("#checkoutBreakdown").textContent =
    money(p.amount_cents) + " bill + " + money(p.tip_cents) + " optional tip";
  if (p.provider !== "mock")
    throw Error("This checkout is only for the mock provider.");
  document.querySelector("#complete").disabled = false;
}
document.querySelector("#complete").onclick = async () => {
  const b = document.querySelector("#complete");
  b.disabled = true;
  try {
    const r = await fetch(
      "/api/demo/payments/" + encodeURIComponent(pid) + "/outcome",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Groundwork": "1" },
        body: JSON.stringify({
          outcome: document.querySelector("#checkoutOutcome").value,
        }),
      },
    );
    if (!r.ok) throw Error((await r.json()).message);
    location.href = ret;
  } catch (e) {
    document.querySelector("#checkoutError").textContent = e.message;
    b.disabled = false;
  }
};
init().catch(
  (e) => (document.querySelector("#checkoutError").textContent = e.message),
);
