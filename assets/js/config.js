/*
 * Landing page settings. This is the only file you normally need to edit.
 */
window.LP_CONFIG = {
  // Where leads go.
  //   "formsubmit"  – emails every lead to `email` via formsubmit.co (no backend; activate once, see README)
  //   "apps-script" – POSTs the JSON payload to a Google Apps Script web app (emails + logs to a Sheet)
  //   "json"        – POSTs the raw JSON payload to any webhook (Make, n8n, CRM…)
  lead: {
    provider: "formsubmit",
    email: "m.kononiuk.biz@gmail.com",
    // After the first FormSubmit activation you can replace the email above with the random
    // string FormSubmit gives you, so the address is not visible in the page source.
    url: "" // used by "apps-script" and "json"
  },

  linkedinUrl: "https://www.linkedin.com/in/margarita-kononiuk",
  privacyUrl: "privacy.html",

  // Free-mail domains (gmail.com etc.). false = show a soft hint and send email_type: "free";
  // true = block the address with an error.
  blockFreeMail: false,
  freeMailDomains: [
    "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
    "icloud.com", "aol.com", "proton.me", "mail.ru", "yandex.ru"
  ],

  // Capacity line above the button. Only turn on while it is true.
  capacity: { show: false, left: 3, month: "December" },

  // Optional GA4 measurement ID (e.g. "G-XXXXXXX"). Loaded only after calculator
  // numbers are stripped from the address bar.
  ga4Id: "",

  // Minimum time on page before a submit is accepted (spam guard), ms.
  minSubmitMs: 3000
};
