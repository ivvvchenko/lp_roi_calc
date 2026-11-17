/* Free ROI Fix Plan landing — reads calculator numbers from the extension URL (contract v1),
 * shows them, stores UTMs (first/last touch) and sends the lead. Plain JS, no dependencies. */
(function () {
  "use strict";

  var CFG = window.LP_CONFIG || {};
  var STORAGE_CALC = "roi_calc";
  var STORAGE_UTM = "roi_utm";
  var UTM_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  var MAX_NUM = 1e9;
  var MAX_LEN = 64;
  var loadedAt = Date.now();

  /* ------------------------------------------------------------------ *
   * URL contract v1
   * ------------------------------------------------------------------ */
  var NUM_KEYS = ["spend", "cpc", "cr", "aov", "lead_to_call", "close_rate", "ltv", "fee", "margin",
    "revenue", "profit", "roi", "roas", "cpa", "lever_gain"];
  var ENUMS = {
    tab: ["ecom", "leadgen", "edu"],
    top_lever: ["cpc", "cr", "aov", "margin", "call", "close", "ltv"],
    state: ["loss", "thin", "high"]
  };
  var CALC_KEYS = ["v", "ext_ver", "currency"].concat(NUM_KEYS, Object.keys(ENUMS));
  var UTM_KEYS = ["source", "medium", "campaign", "content", "term"];

  var LEVER_TEXT = {
    cpc: "cost per click", cr: "conversion rate", aov: "average order value", margin: "profit margin",
    call: "lead-to-call rate", close: "close rate", ltv: "customer lifetime value"
  };
  var TAB_TEXT = { ecom: "E-commerce", leadgen: "Lead gen", edu: "Education" };

  function clip(s) { return String(s).slice(0, MAX_LEN); }

  function parseNum(raw) {
    if (raw == null || raw === "") return undefined;
    var n = Number(clip(raw));
    if (!isFinite(n) || Math.abs(n) > MAX_NUM) return undefined;
    return n;
  }

  function parseCalc(params) {
    if (params.get("v") !== "1") return null;
    var c = { present: true, v: 1 };
    var ext = clip(params.get("ext_ver") || "");
    if (/^[0-9A-Za-z.\-]{1,20}$/.test(ext)) c.ext_ver = ext;
    var cur = clip(params.get("currency") || "").toUpperCase();
    c.currency = /^[A-Z]{3}$/.test(cur) && currencyOk(cur) ? cur : "USD";
    Object.keys(ENUMS).forEach(function (k) {
      var val = clip(params.get(k) || "");
      if (ENUMS[k].indexOf(val) !== -1) c[k] = val;
    });
    if (!c.tab) return null; // tab is required to label the numbers correctly
    NUM_KEYS.forEach(function (k) {
      var n = parseNum(params.get(k));
      if (n !== undefined) c[k] = n;
    });
    // Derive state from ROI if the extension did not send it.
    if (!c.state && typeof c.roi === "number") c.state = c.roi < 0 ? "loss" : c.roi <= 100 ? "thin" : "high";
    return c;
  }

  function currencyOk(code) {
    try { new Intl.NumberFormat("en-US", { style: "currency", currency: code }); return true; } catch (e) { return false; }
  }

  /* ------------------------------------------------------------------ *
   * Safe storage helpers
   * ------------------------------------------------------------------ */
  function store(kind) {
    try { var s = window[kind]; var t = "__t"; s.setItem(t, t); s.removeItem(t); return s; } catch (e) { return null; }
  }
  var local = store("localStorage");
  var session = store("sessionStorage");
  function readJSON(s, key) { if (!s) return null; try { return JSON.parse(s.getItem(key)); } catch (e) { return null; } }
  function writeJSON(s, key, val) { if (!s) return; try { s.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ } }

  /* ------------------------------------------------------------------ *
   * 1. Read params, persist, strip calculator values from the address bar
   * ------------------------------------------------------------------ */
  var url = new URL(window.location.href);
  var params = url.searchParams;

  var calc = parseCalc(params);
  if (calc) writeJSON(session, STORAGE_CALC, calc);
  else if (!params.has("v")) calc = readJSON(session, STORAGE_CALC); // reload keeps the numbers
  if (calc && calc.present !== true) calc = null;

  // UTMs from this URL
  var urlUtm = null;
  UTM_KEYS.forEach(function (k) {
    var v = params.get("utm_" + k);
    if (v) { urlUtm = urlUtm || {}; urlUtm[k] = clip(v); }
  });
  var utm = saveUtm(urlUtm);

  // Remove calculator params (UTMs stay for analytics).
  var stripped = false;
  CALC_KEYS.forEach(function (k) { if (params.has(k)) { params.delete(k); stripped = true; } });
  if (stripped && window.history && history.replaceState) {
    history.replaceState(history.state, "", url.pathname + (params.toString() ? "?" + params.toString() : "") + url.hash);
  }
  var cleanUrl = window.location.href;

  loadAnalytics(); // only after stripping

  function saveUtm(current) {
    var now = Date.now();
    var stamp = function (o) {
      var r = { source: null, medium: null, campaign: null, content: null, term: null, ts: new Date(now).toISOString() };
      UTM_KEYS.forEach(function (k) { if (o[k]) r[k] = o[k]; });
      return r;
    };
    if (!local) { // private mode: use current URL for both
      var t = current ? stamp(current) : null;
      return { first: t, last: t };
    }
    var saved = readJSON(local, STORAGE_UTM) || {};
    if (saved.first && saved.first.ts && now - Date.parse(saved.first.ts) > UTM_TTL_MS) saved = {};
    if (current) {
      saved.last = stamp(current);
      if (!saved.first) saved.first = saved.last;
      writeJSON(local, STORAGE_UTM, saved);
    } else if (!saved.first) {
      try { local.removeItem(STORAGE_UTM); } catch (e) { /* ignore */ }
    }
    return { first: saved.first || null, last: saved.last || null };
  }

  function loadAnalytics() {
    var id = CFG.ga4Id;
    if (!id || !/^G-[A-Z0-9]+$/.test(id)) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id);
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ *
   * 2. Formatting
   * ------------------------------------------------------------------ */
  function money(n, opts) {
    if (typeof n !== "number") return "—";
    var cur = (calc && calc.currency) || "USD";
    var small = Math.abs(n) < 100 && n % 1 !== 0;
    var o = { style: "currency", currency: cur, maximumFractionDigits: small ? 2 : 0, minimumFractionDigits: small ? 2 : 0 };
    if (opts) Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
    try { return new Intl.NumberFormat("en-US", o).format(n); } catch (e) { return cur + " " + n; }
  }
  function pct(n) {
    if (typeof n !== "number") return "—";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n) + "%";
  }
  function roas(n) { return typeof n === "number" ? n.toFixed(2) + "x" : "—"; }

  /* ------------------------------------------------------------------ *
   * 3. Hero (message match with the banner)
   * ------------------------------------------------------------------ */
  var $ = function (id) { return document.getElementById(id); };

  function renderHero() {
    var pill = $("statePill"), title = $("heroTitle"), sub = $("heroSub");
    if (!calc || !calc.state) return;
    var s = calc.state;
    if (s === "loss" && typeof calc.profit === "number" && calc.profit < 0) {
      var loss = money(Math.abs(calc.profit), { maximumFractionDigits: 0, minimumFractionDigits: 0 });
      pill.textContent = "Losing " + loss + "/mo";
      pill.classList.add("state-pill--loss");
      title.textContent = "Your ads are losing " + loss + " a month. Let's find the leak.";
      sub.textContent = "Send your website. Within 48 hours you get a 10-minute video and the 3 fixes that stop the loss. Free.";
    } else if (s === "thin" && calc.top_lever && typeof calc.lever_gain === "number" && calc.lever_gain > 0) {
      pill.textContent = typeof calc.roi === "number" ? "Profitable, but thin — ROI " + pct(calc.roi) : "Profitable, but thin";
      title.textContent = "A 10% better " + LEVER_TEXT[calc.top_lever] + " is worth +" +
        money(calc.lever_gain, { maximumFractionDigits: 0, minimumFractionDigits: 0 }) + "/month to you.";
      sub.textContent = "Here's how to get it in your account: a 10-minute video and your top 3 fixes, within 48 hours. Free.";
    } else if (s === "high" && typeof calc.roi === "number") {
      pill.textContent = "Nice — ROI " + pct(calc.roi);
      title.textContent = "ROI " + pct(calc.roi) + ". Let's scale it without breaking it.";
      sub.textContent = "Get a scaling plan for your account: structure, budget split, tracking. Video + one page, within 48 hours. Free.";
    } else {
      return;
    }
    pill.hidden = false;

    if (calc.top_lever && typeof calc.lever_gain === "number" && calc.lever_gain > 0) {
      $("leverItem").textContent = "Worked out from your calculator numbers. Right now it's your " + LEVER_TEXT[calc.top_lever] +
        ": +" + money(calc.lever_gain, { maximumFractionDigits: 0, minimumFractionDigits: 0 }) + "/month from a 10% gain.";
    }
  }

  /* ------------------------------------------------------------------ *
   * 4. Numbers table
   * ------------------------------------------------------------------ */
  function renderNumbers() {
    if (!calc) return;
    var t = calc.tab;
    var crLabel = { ecom: "Website conversion rate", leadgen: "Landing page opt-in rate", edu: "Opt-in rate" }[t];
    var callLabel = t === "edu" ? "Application rate" : "Lead → call rate";
    var rows = [
      ["Business model", TAB_TEXT[t]],
      ["Monthly ad spend", calc.spend, money],
      ["CPC", calc.cpc, function (n) { return money(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }],
      [crLabel, calc.cr, pct],
      ["Profit / month", calc.profit, money, true],
      ["ROI", calc.roi, pct, true],
      // extra rows
      ["Average order value", t === "ecom" ? calc.aov : undefined, money],
      [callLabel, t !== "ecom" ? calc.lead_to_call : undefined, pct],
      ["Close rate", t !== "ecom" ? calc.close_rate : undefined, pct],
      ["Customer lifetime value", calc.ltv, money],
      ["Management fee / month", calc.fee, money],
      ["Profit margin", calc.margin, pct],
      ["Revenue / month", calc.revenue, money],
      ["ROAS", calc.roas, roas],
      ["Cost per sale", calc.cpa, money],
      ["Top lever", calc.top_lever ? LEVER_TEXT[calc.top_lever] : undefined],
      ["Gain from +10% on top lever", calc.lever_gain, money]
    ];
    var grid = $("numbersGrid");
    var extra = 0;
    rows.forEach(function (r, i) {
      if (r[1] === undefined || r[1] === null) return;
      var row = document.createElement("div");
      row.className = "numbers__row";
      var dt = document.createElement("dt"); dt.textContent = r[0];
      var dd = document.createElement("dd"); dd.textContent = r[2] ? r[2](r[1]) : String(r[1]);
      if (r[3] && typeof r[1] === "number") dd.className = r[1] < 0 ? "is-neg" : "";
      row.appendChild(dt); row.appendChild(dd);
      if (i >= 6) { row.hidden = true; row.dataset.extra = "1"; extra++; }
      grid.appendChild(row);
    });
    var toggle = $("numbersToggle");
    if (extra) {
      toggle.hidden = false;
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") === "true";
        grid.querySelectorAll("[data-extra]").forEach(function (el) { el.hidden = open; });
        toggle.setAttribute("aria-expanded", String(!open));
        toggle.textContent = open ? "Show all" : "Show less";
      });
    }
    $("numbers").hidden = false;
    $("attachedNote").hidden = false;
  }

  /* ------------------------------------------------------------------ *
   * 5. Case studies
   * ------------------------------------------------------------------ */
  var CASES = [
    { id: "heating", file: "cases/heating-store-google-yandex-ads.pdf", lang: "RU",
      platform: "Google Ads · Yandex Direct", metric: "+169%",
      title: "Heating equipment online store",
      desc: "+169% conversions at 12% lower CPA in peak season (Aug–Oct 2025 vs 2024, Google Ads). Duplicate conversions found and fixed.",
      tabs: ["ecom"] },
    { id: "edu", file: "cases/education-portal-google-ads.pdf", lang: "EN",
      platform: "Google Ads", metric: "1% → 10%",
      title: "Education e-commerce portal (US)",
      desc: "Conversion rate from 1% to 10% and purchases +200%: account restructure, full-funnel tracking, dynamic remarketing and CRO.",
      tabs: ["edu", "ecom"] },
    { id: "construction", file: "cases/construction-google-ads.pdf", lang: "RU",
      platform: "Google Ads", metric: "$25.24 → $7.13",
      title: "Construction and renovation company",
      desc: "Cost per lead 3.5× lower with a steady flow of quality leads, on a $300/month budget.",
      tabs: ["leadgen", "ecom", "edu"] },
    { id: "jewelry", file: "cases/jewelry-meta-ads.pdf", lang: "EN",
      platform: "Meta Ads", metric: "1,257 leads",
      title: "Custom jewelry (US)",
      desc: "1,257 qualified leads at under $6.50 each in 3 months, in a highly competitive niche on a tight budget.",
      tabs: ["leadgen"] },
    { id: "swim", file: "cases/swim-school-google-ads.pdf", lang: "RU",
      platform: "Google Ads", metric: "−53% CPL",
      title: "Kids' swim school",
      desc: "Cost per lead $6.52 → $3.08 while the budget was cut by more than half ($663 → $305). Groups 100% full.",
      tabs: ["edu", "leadgen"] },
    { id: "wellness", file: "cases/wellness-centre-google-ads.pdf", lang: "EN",
      platform: "Google Ads", metric: "+280%",
      title: "Health & wellness centre (Australia)",
      desc: "+280% conversions after rebuilding tracking, replacing a Smart campaign with Search and filtering out existing clients.",
      tabs: ["leadgen"] }
  ];
  var ORDER = {
    ecom: ["heating", "edu", "construction", "jewelry", "swim", "wellness"],
    leadgen: ["construction", "jewelry", "swim", "wellness", "heating", "edu"],
    edu: ["edu", "swim", "construction", "wellness", "jewelry", "heating"],
    none: ["heating", "edu", "construction", "jewelry", "swim", "wellness"]
  };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderCases() {
    var grid = $("casesGrid");
    var tab = calc && calc.tab;
    var order = ORDER[tab || "none"];
    var byId = {};
    CASES.forEach(function (c) { byId[c.id] = c; });
    order.forEach(function (id, i) {
      var c = byId[id];
      var a = el("a", "case");
      a.href = c.file;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("aria-label", c.title + " — open case study PDF in a new tab" + (c.lang === "RU" ? " (in Russian)" : ""));
      var match = tab && i === 0;
      if (match) { a.classList.add("case--match"); a.appendChild(el("span", "case__match", "Closest to you")); }
      var top = el("div", "case__top");
      top.appendChild(el("span", "case__platform", c.platform));
      var lang = el("span", "case__lang", "PDF · " + c.lang);
      lang.title = c.lang === "RU" ? "Case study in Russian" : "Case study in English";
      top.appendChild(lang);
      a.appendChild(top);
      a.appendChild(el("p", "case__metric", c.metric));
      a.appendChild(el("h3", "case__title", c.title));
      a.appendChild(el("p", "case__desc", c.desc));
      var cta = el("span", "case__cta", "Read the case ");
      cta.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
      a.appendChild(cta);
      a.addEventListener("click", function () { track("case_open", { case_id: c.id }); });
      grid.appendChild(a);
    });
  }

  /* ------------------------------------------------------------------ *
   * 6. Form
   * ------------------------------------------------------------------ */
  var freeDomains = (CFG.freeMailDomains || []).map(function (d) { return String(d).toLowerCase(); });

  function emailDomain(v) { var i = v.lastIndexOf("@"); return i > -1 ? v.slice(i + 1).toLowerCase() : ""; }
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254; }

  function normalizeWebsite(raw) {
    var v = String(raw || "").trim();
    if (!v) return null;
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    try {
      var u = new URL(v);
      if (!/^https?:$/.test(u.protocol)) return null;
      if (u.hostname.indexOf(".") < 1 || /\.$/.test(u.hostname) || u.hostname.length > 253) return null;
      var out = u.origin + (u.pathname === "/" ? "" : u.pathname);
      return out.slice(0, 300);
    } catch (e) { return null; }
  }

  function setError(input, errEl, msg) {
    if (msg) { errEl.textContent = msg; errEl.hidden = false; if (input) input.setAttribute("aria-invalid", "true"); }
    else { errEl.hidden = true; errEl.textContent = ""; if (input) input.removeAttribute("aria-invalid"); }
  }

  function validateEmail(show) {
    var input = $("email"), v = input.value.trim();
    var hint = $("emailHint");
    var free = isEmail(v) && freeDomains.indexOf(emailDomain(v)) !== -1;
    hint.hidden = !(free && !CFG.blockFreeMail);
    var msg = null;
    if (!isEmail(v)) msg = "Please enter a valid email, e.g. name@company.com";
    else if (free && CFG.blockFreeMail) msg = "Please use your work email, e.g. name@company.com";
    if (show) setError(input, $("emailError"), msg);
    return msg ? null : { value: v, type: free ? "free" : "work" };
  }
  function validateWebsite(show) {
    var input = $("website"); var v = normalizeWebsite(input.value);
    if (show) setError(input, $("websiteError"), v ? null : "Enter your website, e.g. company.com");
    return v;
  }
  function selectedPlatforms(show) {
    var vals = Array.prototype.map.call(document.querySelectorAll('input[name="platforms"]:checked'), function (i) { return i.value; });
    if (show) setError(null, $("platformsError"), vals.length ? null : "Pick at least one platform");
    return vals;
  }

  function buildPayload(email, website, platforms) {
    var calcOut = { present: false };
    if (calc) {
      calcOut = { present: true };
      ["v", "ext_ver", "tab", "currency"].concat(NUM_KEYS, ["top_lever", "state"]).forEach(function (k) {
        if (calc[k] !== undefined) calcOut[k] = calc[k];
      });
    }
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* ignore */ }
    return {
      email: email.value,
      email_type: email.type,
      website: website,
      platforms: platforms,
      calc: calcOut,
      utm: { first: utm.first, last: utm.last },
      meta: {
        landing_url: cleanUrl,
        referrer: document.referrer || "",
        submitted_at: new Date().toISOString(),
        timezone: tz,
        language: navigator.language || ""
      }
    };
  }

  /* Flatten the payload into readable fields for the email (FormSubmit). */
  function toEmailFields(p) {
    var c = p.calc;
    var f = {
      _subject: "New ROI Fix Plan request — " + p.website.replace(/^https?:\/\//, ""),
      _template: "table",
      _captcha: "false",
      _replyto: p.email,
      "Email": p.email + (p.email_type === "free" ? " (free mail)" : ""),
      "Website": p.website,
      "Ad platforms": p.platforms.join(", ")
    };
    if (c.present) {
      f["Calculator: business model"] = TAB_TEXT[c.tab] || c.tab;
      f["Calculator: state"] = c.state || "";
      f["Calculator: currency"] = c.currency;
      NUM_KEYS.forEach(function (k) { if (c[k] !== undefined) f["Calculator: " + k] = String(c[k]); });
      if (c.top_lever) f["Calculator: top lever"] = LEVER_TEXT[c.top_lever];
    } else {
      f["Calculator"] = "No calculator data (direct visit)";
    }
    var u = function (t) { return t ? [t.source, t.medium, t.campaign, t.content, t.term].map(function (x) { return x || "-"; }).join(" / ") + " @ " + t.ts : "none"; };
    f["UTM first touch"] = u(p.utm.first);
    f["UTM last touch"] = u(p.utm.last);
    f["Landing URL"] = p.meta.landing_url;
    f["Submitted at"] = p.meta.submitted_at + " (" + p.meta.timezone + ")";
    f["Raw JSON"] = JSON.stringify(p);
    return f;
  }

  function sendLead(p) {
    var lead = CFG.lead || {};
    var timeout = new Promise(function (_, reject) { setTimeout(function () { reject(new Error("timeout")); }, 20000); });
    var req;
    if (lead.provider === "formsubmit") {
      if (!/^[A-Za-z0-9@._+\-]+$/.test(lead.email || "")) return Promise.reject(new Error("Bad lead.email in config"));
      req = fetch("https://formsubmit.co/ajax/" + lead.email, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(toEmailFields(p))
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || String(j.success) !== "true") throw new Error(j.message || "Request failed");
      }); });
    } else if (lead.provider === "apps-script") {
      // text/plain avoids a CORS preflight, which Apps Script does not answer.
      req = fetch(lead.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(p), redirect: "follow" })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (!j || j.ok !== true) throw new Error((j && j.error) || "Request failed"); });
    } else {
      req = fetch(lead.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); });
    }
    return Promise.race([req, timeout]);
  }

  function track(name, params) {
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  }

  function showSuccess(email) {
    $("successEmail").textContent = email;
    $("formCard").hidden = true;
    var s = $("successCard");
    s.hidden = false;
    s.focus({ preventScroll: true });
    var top = s.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
  }

  function initForm() {
    var form = $("leadForm"), btn = $("submitBtn"), formErr = $("formError");
    var sending = false;

    $("email").addEventListener("blur", function () { if (this.value) validateEmail(true); });
    $("email").addEventListener("input", function () { if (this.getAttribute("aria-invalid")) validateEmail(true); else validateEmail(false); });
    $("website").addEventListener("blur", function () { if (this.value) validateWebsite(true); });
    $("website").addEventListener("input", function () { if (this.getAttribute("aria-invalid")) validateWebsite(true); });
    form.addEventListener("change", function (e) { if (e.target.name === "platforms" && !$("platformsError").hidden) selectedPlatforms(true); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return;
      formErr.hidden = true;

      var email = validateEmail(true);
      var website = validateWebsite(true);
      var platforms = selectedPlatforms(true);
      if (!email || !website || !platforms.length) {
        var firstBad = form.querySelector('[aria-invalid="true"]') || form.querySelector('input[name="platforms"]');
        if (firstBad) firstBad.focus();
        return;
      }

      // Spam guard: fail silently.
      if ($("company_fax").value || Date.now() - loadedAt < (CFG.minSubmitMs || 3000)) {
        showSuccess(email.value);
        return;
      }

      var payload = buildPayload(email, website, platforms);
      sending = true;
      btn.disabled = true;
      btn.classList.add("is-loading");
      btn.querySelector(".btn__label").textContent = "Sending…";

      sendLead(payload).then(function () {
        track("generate_lead", { utm_content: (utm.last && utm.last.content) || "", tab: payload.calc.tab || "none" });
        showSuccess(email.value);
      }).catch(function (err) {
        formErr.textContent = "Sorry, something went wrong and your request wasn't sent. Please try again in a moment" +
          " or message me on LinkedIn.";
        formErr.hidden = false;
        if (window.console) console.warn("Lead submit failed:", err);
      }).then(function () {
        sending = false;
        btn.disabled = false;
        btn.classList.remove("is-loading");
        btn.querySelector(".btn__label").textContent = "Get my free plan";
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * 7. Misc
   * ------------------------------------------------------------------ */
  function initMisc() {
    // Config-driven links
    if (CFG.linkedinUrl) document.querySelectorAll(".js-linkedin").forEach(function (a) { a.href = CFG.linkedinUrl; });
    if (CFG.privacyUrl) document.querySelectorAll(".js-privacy").forEach(function (a) { a.href = CFG.privacyUrl; });
    document.querySelectorAll(".js-linkedin").forEach(function (a) {
      a.addEventListener("click", function () { track("linkedin_click", { location: a.closest("section, header, footer") ? (a.closest("section, header, footer").id || a.closest("section, header, footer").tagName.toLowerCase()) : "" }); });
    });

    // Capacity line
    var cap = CFG.capacity;
    if (cap && cap.show) {
      $("capacity").textContent = "5 plans a month. " + cap.left + " left for " + cap.month + ".";
      $("capacity").hidden = false;
    }

    // CTA buttons scroll to the form and focus the email field
    document.querySelectorAll(".js-to-form").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var target = $("formCard").hidden ? $("successCard") : $("formCard");
        var top = target.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
        if (!$("formCard").hidden) setTimeout(function () { $("email").focus({ preventScroll: true }); }, 450);
      });
    });

    // Top bar border on scroll
    var bar = document.querySelector(".topbar");
    var onScroll = function () { bar.classList.toggle("is-scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    $("year").textContent = String(new Date().getFullYear());
  }

  function init() {
    renderHero();
    renderNumbers();
    renderCases();
    initForm();
    initMisc();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
