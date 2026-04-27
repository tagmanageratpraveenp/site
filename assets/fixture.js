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

  function readPageMetadata() {
    const node = document.getElementById("dot-fixture-metadata");
    if (!node) return null;
    return JSON.parse(node.textContent);
  }

  function renderMetadata(metadata) {
    const installStatus = fixtureInstallStatus();
    return `
      <dl class="metadata-list">
        <div><dt>Scenario</dt><dd>${metadata.scenarioId}</dd></div>
        <div><dt>Install status</dt><dd>${installStatus}</dd></div>
        <div><dt>State</dt><dd>${metadata.expectedState}</dd></div>
        <div><dt>Integration</dt><dd>${metadata.integration}</dd></div>
        <div><dt>Category</dt><dd>${metadata.category}</dd></div>
        <div><dt>Tags</dt><dd>${(metadata.tagTypes || []).join(", ")}</dd></div>
        <div><dt>Known issue</dt><dd>${metadata.knownIssue || "none"}</dd></div>
        <div><dt>Pixel ID</dt><dd>${metadata.pixelId || "none"}</dd></div>
        <div><dt>Rule ID</dt><dd>${metadata.ruleId || "none"}</dd></div>
        <div><dt>GTM ID</dt><dd>${metadata.gtmContainerId || "none"}</dd></div>
      </dl>
    `;
  }

  function fixtureInstallStatus() {
    const liveDot = Boolean(document.querySelector('script[data-dot-fixture-tag="base-js"][type="application/javascript"]'));
    const liveGtm = Boolean(document.querySelector('script[data-dot-fixture-tag="gtm-container"]:not([type="application/json"])'));
    const placeholders = document.querySelectorAll('script[type="application/x-dot-pixel-placeholder"], script[data-dot-fixture-tag="gtm-container"][type="application/json"]').length;
    if ((liveDot || liveGtm) && placeholders > 0) return "Partially functional; event wiring is scaffolded";
    if (liveDot || liveGtm) return "Functional install snippet present";
    if (placeholders > 0) return "Scaffolded placeholder install";
    return "No install snippet present";
  }

  function fixtureContent(metadata) {
    const isLead = metadata.category === "lead-gen";
    const isTravel = metadata.category === "travel";
    const isContent = metadata.category === "content";
    const eventName = (metadata.expectedEvents || []).find((event) => event.trigger === "user-action")?.name
      || (metadata.expectedEvents || [])[0]?.name
      || "fixture_event";
    const canFireAction = !metadata.disableActionHandler;
    const isPurchase = (metadata.tagTypes || []).includes("purchase") || eventName === "purchase" || metadata.scenarioId.includes("duplicate") || metadata.scenarioId.includes("trigger");
    if (isLead) {
      return `
        <div class="lead-card">
          <h2>${eventName === "lead" && metadata.expectedEvents?.[0]?.trigger === "user-action" ? "Lead request" : "Lead confirmation"}</h2>
          <p>Thanks for requesting a consultation. This page carries the lead-generation fixture state for enhanced matching and form scenarios.</p>
          ${metadata.expectedEvents?.[0]?.trigger === "user-action" ? `
            <label>Name<input value="Test Visitor" aria-label="Name"></label>
            <label>Email<input value="TEST_EMAIL_PLACEHOLDER" aria-label="Email"></label>
            <button class="action-button" ${canFireAction ? `data-fixture-action="lead" data-fixture-event="${eventName}"` : ""}>Submit lead</button>
          ` : ""}
          <p><strong>Email hash:</strong> ${metadata.matching?.he || "HASHED_EMAIL_PLACEHOLDER"}</p>
          <p><strong>Phone hash:</strong> ${metadata.matching?.hph || "HASHED_PHONE_PLACEHOLDER"}</p>
        </div>
      `;
    }
    if (isContent) {
      return `
        <article class="product-card">
          <div class="product-media" aria-hidden="true"></div>
          <h2>Performance marketing guide</h2>
          <p>This article page is a content fixture for image-pixel and bad-URL scenarios.</p>
          <p>Visitors can read the article without requiring a commerce or form action.</p>
        </article>
      `;
    }
    if (isTravel) {
      return `
        <div class="checkout-card">
          <h2>${metadata.scenarioId.includes("confirmation") ? "Booking confirmation" : "Hotel detail"}</h2>
          <p>Harbor View Hotel, Toronto. Two nights, flexible cancellation, breakfast included.</p>
          <p><strong>Booking value:</strong> $489.00 USD</p>
          ${metadata.expectedEvents?.[0]?.trigger === "user-action" ? `<button class="action-button" ${canFireAction ? `data-fixture-action="booking" data-fixture-event="${eventName}"` : ""}>Complete booking</button>` : ""}
        </div>
      `;
    }
    if (isPurchase) {
      return `
        <div class="checkout-card">
          <h2>Order confirmation</h2>
          <p>Order <strong>ORDER-1001</strong> is complete.</p>
          <p>Total: <strong>$129.99 USD</strong></p>
          <button class="action-button" ${canFireAction ? `data-fixture-action="purchase" data-fixture-event="${eventName}"` : ""}>Replay purchase action</button>
        </div>
      `;
    }
    return `
      <div class="product-card">
        <div class="product-media" aria-hidden="true"></div>
        <h2>Retail product page</h2>
        <p>Performance jacket with weather-resistant shell and lightweight insulation.</p>
        <p><strong>$129.99</strong></p>
        <button class="action-button" ${canFireAction ? `data-fixture-action="cart" data-fixture-event="${eventName}"` : ""}>Add to cart</button>
      </div>
    `;
  }

  function renderFixturePage() {
    const root = document.getElementById("fixture-root");
    if (!root) return;
    const metadata = readPageMetadata();
    if (!metadata) return;

    document.title = `${metadata.scenarioId} | Dot Pixel Fixture`;
    root.innerHTML = `
      <nav class="fixture-nav">
        <a class="back-link" href="/?q=${encodeURIComponent(metadata.scenarioId)}">Scenario catalog</a>
        <span class="scenario-id">${metadata.pageUrl}</span>
      </nav>
      <section class="fixture-hero">
        <p class="eyebrow">${metadata.integration} / ${metadata.expectedState}</p>
        <h1>${metadata.title}</h1>
        <div class="badge-row">
          <span class="badge ${metadata.expectedState}">${metadata.expectedState}</span>
          <span class="badge">${metadata.integration}</span>
          <span class="badge">${metadata.category}</span>
          ${(metadata.tagTypes || []).map((tag) => `<span class="badge">${tag}</span>`).join("")}
          ${metadata.knownIssue ? `<span class="badge failure">${metadata.knownIssue}</span>` : ""}
        </div>
      </section>
      <section class="fixture-grid">
        <article class="fixture-panel">
          ${fixtureContent(metadata)}
        </article>
        <aside class="fixture-panel">
          <h2>Fixture metadata</h2>
          ${renderMetadata(metadata)}
          <div class="notice">
            Placeholder Dot/GTM values are intentional until real snippets and container IDs are supplied.
          </div>
          <h3>Observed fixture events</h3>
          <pre class="event-log" id="event-log">No fixture events recorded yet.</pre>
        </aside>
      </section>
    `;

    document.querySelectorAll("[data-fixture-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.getAttribute("data-fixture-action");
        const eventName = button.getAttribute("data-fixture-event") || (action === "cart" ? "add_to_cart" : action);
        const event = metadata.integration === "gtm"
          ? window.dotFixture.pushDataLayer({ event: eventName, scenarioId: metadata.scenarioId })
          : window.dotFixture.record(eventName, { scenarioId: metadata.scenarioId });
        renderEventLog(event);
      });
    });

    const pageLoadEvent = (metadata.expectedEvents || []).find((event) => event.trigger === "page-load" && event.shouldFire);
    if (pageLoadEvent) {
      const count = pageLoadEvent.expectedCount || 1;
      for (let index = 0; index < count; index += 1) {
        if (metadata.integration === "gtm") {
          window.dotFixture.pushDataLayer({ event: pageLoadEvent.name, scenarioId: metadata.scenarioId, sequence: index + 1 });
        } else {
          window.dotFixture.record(pageLoadEvent.name, { scenarioId: metadata.scenarioId, sequence: index + 1 });
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
