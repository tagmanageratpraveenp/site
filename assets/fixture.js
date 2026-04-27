(function () {
  const manifestUrl = "/manifest.json";
  const params = new URLSearchParams(window.location.search);
  const allValue = "all";

  const text = (value) => String(value == null ? "" : value);
  const slugLabel = (value) => text(value).replace(/-/g, " ");
  const unique = (items) => Array.from(new Set(items.filter(Boolean))).sort();

  const dotFixture = {
    events: [],
    record(name, payload) {
      const event = {
        name,
        payload: payload || {},
        timestamp: new Date().toISOString()
      };
      this.events.push(event);
      window.dispatchEvent(new CustomEvent("dotfixture:event", { detail: event }));
      return event;
    },
    pushDataLayer(payload) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(payload);
      return this.record("dataLayer.push", payload);
    }
  };

  window.dotFixture = window.dotFixture || dotFixture;

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function option(value, label) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    return node;
  }

  function badge(value, extraClass) {
    const node = document.createElement("span");
    node.className = ["badge", extraClass].filter(Boolean).join(" ");
    node.textContent = slugLabel(value);
    return node;
  }

  function scenarioSearchText(scenario) {
    return [
      scenario.scenarioId,
      scenario.title,
      scenario.category,
      scenario.integration,
      scenario.expectedState,
      scenario.knownIssue,
      ...(scenario.tagTypes || [])
    ].join(" ").toLowerCase();
  }

  function activeFilters() {
    return {
      search: text(document.getElementById("filter-search")?.value).trim().toLowerCase(),
      state: document.getElementById("filter-state")?.value || allValue,
      integration: document.getElementById("filter-integration")?.value || allValue,
      category: document.getElementById("filter-category")?.value || allValue,
      tag: document.getElementById("filter-tag")?.value || allValue
    };
  }

  function syncUrl(filters) {
    const next = new URLSearchParams();
    if (filters.search) next.set("q", filters.search);
    if (filters.state !== allValue) next.set("state", filters.state);
    if (filters.integration !== allValue) next.set("integration", filters.integration);
    if (filters.category !== allValue) next.set("category", filters.category);
    if (filters.tag !== allValue) next.set("tag", filters.tag);
    const query = next.toString();
    const url = query ? `/?${query}` : "/";
    window.history.replaceState(null, "", url);
  }

  function matchesScenario(scenario, filters) {
    const tagsAndIssue = [...(scenario.tagTypes || []), scenario.knownIssue].filter(Boolean);
    return (!filters.search || scenarioSearchText(scenario).includes(filters.search))
      && (filters.state === allValue || scenario.expectedState === filters.state)
      && (filters.integration === allValue || scenario.integration === filters.integration)
      && (filters.category === allValue || scenario.category === filters.category)
      && (filters.tag === allValue || tagsAndIssue.includes(filters.tag));
  }

  function scenarioCard(scenario) {
    const card = document.createElement("article");
    card.className = "scenario-card";

    const id = document.createElement("div");
    id.className = "scenario-id";
    id.textContent = scenario.scenarioId;

    const title = document.createElement("h3");
    title.textContent = scenario.title;

    const badges = document.createElement("div");
    badges.className = "badge-row";
    badges.append(
      badge(scenario.expectedState, scenario.expectedState),
      badge(scenario.integration),
      badge(scenario.category),
      ...(scenario.tagTypes || []).map((tag) => badge(tag)),
      ...(scenario.knownIssue ? [badge(scenario.knownIssue, "failure")] : [])
    );

    const link = document.createElement("a");
    link.className = "open-link";
    link.href = scenario.path;
    link.textContent = "Open fixture";

    card.append(id, title, badges, link);
    return card;
  }

  function scenarioRow(scenario) {
    const row = document.createElement("tr");
    const tags = [...(scenario.tagTypes || []), scenario.knownIssue].filter(Boolean).map(slugLabel).join(", ");
    row.innerHTML = `
      <td><strong>${scenario.title}</strong><br><span class="scenario-id">${scenario.scenarioId}</span></td>
      <td><span class="badge ${scenario.expectedState}">${scenario.expectedState}</span></td>
      <td>${slugLabel(scenario.integration)}</td>
      <td>${slugLabel(scenario.category)}</td>
      <td>${tags}</td>
      <td><span class="scenario-id">${scenario.path}</span></td>
    `;
    return row;
  }

  function renderCatalog(scenarios) {
    const filters = activeFilters();
    const filtered = scenarios.filter((scenario) => matchesScenario(scenario, filters));
    syncUrl(filters);

    const cards = document.getElementById("scenario-cards");
    const table = document.getElementById("scenario-table");
    if (!cards || !table) return;
    cards.replaceChildren(...filtered.map(scenarioCard));
    table.replaceChildren(...filtered.map(scenarioRow));
    setText("result-count", `${filtered.length} of ${scenarios.length} scenarios shown`);
  }

  function countScenario(scenarios, integration, state) {
    return scenarios.filter((scenario) => scenario.integration === integration && scenario.expectedState === state).length;
  }

  async function initCatalog() {
    const cards = document.getElementById("scenario-cards");
    if (!cards) return;

    try {
      const response = await fetch(manifestUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load ${manifestUrl}`);
      const manifest = await response.json();
      const scenarios = manifest.scenarios || [];

      const categorySelect = document.getElementById("filter-category");
      const tagSelect = document.getElementById("filter-tag");
      unique(scenarios.map((scenario) => scenario.category)).forEach((category) => {
        categorySelect?.append(option(category, slugLabel(category)));
      });
      unique(scenarios.flatMap((scenario) => [...(scenario.tagTypes || []), scenario.knownIssue].filter(Boolean))).forEach((tag) => {
        tagSelect?.append(option(tag, slugLabel(tag)));
      });

      document.getElementById("filter-search").value = params.get("q") || "";
      document.getElementById("filter-state").value = params.get("state") || allValue;
      document.getElementById("filter-integration").value = params.get("integration") || allValue;
      document.getElementById("filter-category").value = params.get("category") || allValue;
      document.getElementById("filter-tag").value = params.get("tag") || allValue;

      setText("count-inline-success", countScenario(scenarios, "inline", "success"));
      setText("count-inline-failure", countScenario(scenarios, "inline", "failure"));
      setText("count-gtm-success", countScenario(scenarios, "gtm", "success"));
      setText("count-gtm-failure", countScenario(scenarios, "gtm", "failure"));

      const stats = document.getElementById("scenario-stats");
      stats?.replaceChildren(
        stat("Total scenarios", scenarios.length),
        stat("Success pages", scenarios.filter((scenario) => scenario.expectedState === "success").length),
        stat("Failure pages", scenarios.filter((scenario) => scenario.expectedState === "failure").length),
        stat("Categories", unique(scenarios.map((scenario) => scenario.category)).length)
      );

      ["filter-search", "filter-state", "filter-integration", "filter-category", "filter-tag"].forEach((id) => {
        document.getElementById(id)?.addEventListener("input", () => renderCatalog(scenarios));
      });
      renderCatalog(scenarios);
    } catch (error) {
      cards.innerHTML = `<article class="scenario-card"><h3>Manifest unavailable</h3><p>${error.message}</p></article>`;
      setText("result-count", "Unable to load scenarios");
    }
  }

  function stat(label, value) {
    const card = document.createElement("article");
    card.className = "stat-card";
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    return card;
  }

  function pageConfig(root) {
    return {
      kind: root.dataset.pageKind || "retail-product",
      actionEvent: root.dataset.actionEvent || "",
      actionMode: root.dataset.actionMode || "inline",
      actionDisabled: root.dataset.actionDisabled === "true",
      autoEvent: root.dataset.autoEvent || "",
      autoMode: root.dataset.autoMode || "inline",
      autoCount: Number(root.dataset.autoCount || "0")
    };
  }

  function genericTitle(kind) {
    if (kind.startsWith("lead")) return "Lead Request";
    if (kind.startsWith("travel")) return kind.includes("confirmation") ? "Booking Confirmation" : "Hotel Detail";
    if (kind.startsWith("content")) return "Performance Marketing Guide";
    if (kind.includes("confirmation") || kind.includes("checkout")) return "Order Confirmation";
    return "Retail Store";
  }

  function fixtureContent(config) {
    const isLead = config.kind.startsWith("lead");
    const isTravel = config.kind.startsWith("travel");
    const isContent = config.kind.startsWith("content");
    const isPurchase = config.kind.includes("checkout") || config.kind.includes("confirmation") || config.actionEvent === "purchase" || config.autoEvent === "purchase";
    const actionAttrs = config.actionEvent && !config.actionDisabled
      ? `data-fixture-action="${config.actionEvent}" data-fixture-mode="${config.actionMode}"`
      : "";
    if (isLead) {
      return `
        <div class="lead-card">
          <h2>${config.actionEvent ? "Lead request" : "Lead confirmation"}</h2>
          <p>Thanks for requesting a consultation. A specialist will follow up with the requested materials.</p>
          ${config.actionEvent ? `
            <label>Name<input value="Test Visitor" aria-label="Name"></label>
            <label>Email<input value="TEST_EMAIL_PLACEHOLDER" aria-label="Email"></label>
            <button class="action-button" ${actionAttrs}>Submit lead</button>
          ` : ""}
        </div>
      `;
    }
    if (isContent) {
      return `
        <article class="product-card">
          <div class="product-media" aria-hidden="true"></div>
          <h2>Performance marketing guide</h2>
          <p>Practical ideas for measuring media performance across commerce, travel, and lead-generation journeys.</p>
          <p>Visitors can read the article without requiring a commerce or form action.</p>
        </article>
      `;
    }
    if (isTravel) {
      return `
        <div class="checkout-card">
          <h2>${config.kind.includes("confirmation") ? "Booking confirmation" : "Hotel detail"}</h2>
          <p>Harbor View Hotel, Toronto. Two nights, flexible cancellation, breakfast included.</p>
          <p><strong>Booking value:</strong> $489.00 USD</p>
          ${config.actionEvent ? `<button class="action-button" ${actionAttrs}>Complete booking</button>` : ""}
        </div>
      `;
    }
    if (isPurchase) {
      return `
        <div class="checkout-card">
          <h2>Order confirmation</h2>
          <p>Order <strong>ORDER-1001</strong> is complete.</p>
          <p>Total: <strong>$129.99 USD</strong></p>
          ${config.actionEvent ? `<button class="action-button" ${actionAttrs}>Replay purchase action</button>` : ""}
        </div>
      `;
    }
    return `
      <div class="product-card">
        <div class="product-media" aria-hidden="true"></div>
        <h2>Retail product page</h2>
        <p>Performance jacket with weather-resistant shell and lightweight insulation.</p>
        <p><strong>$129.99</strong></p>
        <button class="action-button" ${actionAttrs}>Add to cart</button>
      </div>
    `;
  }

  function renderFixturePage() {
    const root = document.getElementById("fixture-root");
    if (!root) return;
    const config = pageConfig(root);
    document.title = genericTitle(config.kind);
    root.innerHTML = `
      <section class="fixture-grid single">
        <article class="fixture-panel">
          ${fixtureContent(config)}
        </article>
      </section>
    `;

    document.querySelectorAll("[data-fixture-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const eventName = button.getAttribute("data-fixture-action");
        const mode = button.getAttribute("data-fixture-mode");
        const event = mode === "gtm"
          ? window.dotFixture.pushDataLayer({ event: eventName })
          : window.dotFixture.record(eventName);
        renderEventLog(event);
      });
    });

    if (config.autoEvent && config.autoCount > 0) {
      const count = config.autoCount || 1;
      for (let index = 0; index < count; index += 1) {
        if (config.autoMode === "gtm") {
          window.dotFixture.pushDataLayer({ event: config.autoEvent, sequence: index + 1 });
        } else {
          window.dotFixture.record(config.autoEvent, { sequence: index + 1 });
        }
      }
      renderEventLog();
    }
  }

  function renderEventLog() {
    const log = document.getElementById("event-log");
    if (!log) return;
    log.textContent = window.dotFixture.events.length
      ? window.dotFixture.events.map((event) => `${event.timestamp} ${event.name} ${JSON.stringify(event.payload)}`).join("\n")
      : "No fixture events recorded yet.";
  }

  initCatalog();
  renderFixturePage();
})();
