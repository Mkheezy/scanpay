(() => {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let choice = "light";
  try {
    choice = localStorage.getItem("groundwork.appearance") || "light";
  } catch {}
  if (!["light", "dark", "system"].includes(choice)) choice = "light";
  function apply() {
    document.documentElement.dataset.theme =
      choice === "dark" || (choice === "system" && media.matches)
        ? "titanium-dark"
        : "sequoia-light";
    document
      .querySelectorAll("[data-theme-choice]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.themeChoice === choice),
        ),
      );
  }
  apply();
  media.addEventListener("change", apply);
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.querySelectorAll("[data-theme-choice]").forEach((button) =>
      button.addEventListener("click", () => {
        choice = button.dataset.themeChoice;
        try {
          localStorage.setItem("groundwork.appearance", choice);
        } catch {}
        apply();
      }),
    );
  });
})();
