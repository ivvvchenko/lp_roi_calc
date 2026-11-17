# Free ROI Fix Plan: landing page

Static landing page for Margarita Kononiuk (PPC). It captures leads from the ROI Calculator extension.
It's plain HTML, CSS and JS, with no build step, so it runs on any static host (GitHub Pages, Netlify, Cloudflare Pages).

```
index.html            landing page
privacy.html          privacy policy (linked under the form)
assets/js/config.js   ← settings: lead destination, LinkedIn, capacity line, GA4
assets/js/main.js     URL contract v1, numbers table, UTMs, form, case cards
assets/css/styles.css
assets/img/margarita.jpg
cases/*.pdf           case studies (each card opens one in a new tab)
apps-script/Code.gs   optional backend: Gmail + Google Sheet log + confirmation email
```

## Run locally

```bash
python3 -m http.server 8765
```

Open http://localhost:8765/?v=1&tab=ecom&currency=USD&spend=10000&cpc=1.5&cr=3&aov=100&profit=9000&roi=81.8&top_lever=cpc&lever_gain=2222&state=thin&utm_source=roi-extension&utm_medium=ad-slot&utm_campaign=roi-fix-plan&utm_content=ecom-thin-cpc-ga

## How leads reach Gmail

**Default: FormSubmit.** You don't need a server or an account.
1. Deploy the page and send one test request through the form.
2. FormSubmit emails **m.kononiuk.biz@gmail.com** an activation link. Click it once. Requests sent before activation are not delivered.
3. Optional: the activation email also gives a random alias. Put it in `lead.email` in `config.js` so the Gmail address isn't visible in the page source.

Each lead arrives as an email table: email, website, platforms, every calculator number, first and last UTM touch, and the raw JSON payload. Reply-To is set to the lead's address, so pressing Reply in Gmail answers the lead.

**Alternative: Google Apps Script** (`apps-script/Code.gs`). Sends from her own Gmail, logs every lead to a Google Sheet and sends the lead the "Your ROI Fix Plan is in progress" confirmation. Setup steps are at the top of the file. After deploying, set `lead: { provider: "apps-script", url: "<.../exec>" }` in `config.js`.

## Deploy to GitHub Pages

See **DEPLOY.md** for step-by-step browser upload, Pages setup, FormSubmit activation and connecting the extension.
The site goes live at `https://<user>.github.io/<repo>/`. Set that as `PROMO.landingUrl` in the extension (`src/promo.js`).

## What the page does (from the brief)

- **Hero changes with `state`** (loss / thin / high / no data) and repeats the banner label and figure.
- **Calculator params** are validated: `Number()` checks, enum whitelists, 64-character cut-off, values over 1e9 dropped. Everything is rendered with `textContent`. Params are saved to `sessionStorage` and then removed from the address bar with `history.replaceState` before analytics loads. UTMs stay in the URL.
- **UTMs**: first and last touch in `localStorage.roi_utm`, kept for 90 days.
- **Form**: email, website (adds `https://` when missing) and platforms. Spam is blocked by a honeypot and a 3-second minimum before submit (both fail silently). The button is disabled while sending, and an inline error keeps what the visitor typed.
- **Free-mail addresses** (gmail etc.) get a soft hint and are sent with `email_type: "free"`. To block them instead, set `blockFreeMail: true`.
- **Case cards** are ordered so the case closest to the visitor's `tab` comes first. Each card opens its PDF in a new tab.
- **Optional `generate_lead` GA4 event**: set `ga4Id` in `config.js`.

## Open items to confirm with Margarita

- The platform checkboxes are **Google Ads / Meta Ads / Other**, which matches her positioning. The brief also listed LinkedIn and Reddit Ads.
- Wellness case: the PDF says "CPA decreased 512%", which isn't a possible decrease. The card shows only **+280% conversions**.
- Jewelry, education portal and wellness PDFs are written as "we". Confirm her role in them.
- The heating, construction and swim school PDFs are in Russian. Their cards show an "RU" badge.
- The capacity line ("5 plans a month. N left for …") is off. Turn it on in `config.js` only while it's true.
