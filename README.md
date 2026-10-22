# MedEx Service Explorer

Browse and filter MedEx services, grouped by provider, with live facet counts, a currency-safe price filter and a
shareable URL for every view.

## Running it

Requires Node 20 or newer.

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Dev server, with the MSW mock API in the browser |
| `npm test`          | Vitest: unit and integration tests (jsdom + MSW) |
| `npm run typecheck` | `tsc --noEmit`                                   |
| `npm run lint`      | ESLint                                           |
| `npm run build`     | Type check, then production build into `dist/`   |
| `npm run preview`   | Serve the production build                       |

### Seeing the loading, slow, error and offline states

- **Mock API controls** (bottom-left of the page) set each endpoint to *Normal*, *Slow (6 s)*, *Server error (500)*
  or *Network failure*. “Reload data” refetches with the data still on screen, which shows the “couldn’t refresh”
  banner. “Reload from scratch” clears the cache, which shows the skeletons and then the error page.
- **URL flags** apply on load: `?mock=error`, `?mock=error:services`, `?mock=slow`,
  `?mock=network:providers,slow:services`.
- **Offline**: switch DevTools → Network to *Offline*. MSW answers requests inside the page, so the handlers check
  `navigator.onLine` and fail the way a real network would.

## How it is built

```
data/                     the JSON fixture; only the mock API reads it
src/api/                  API types (raw shapes), fetch client, TanStack Query hook
src/mocks/                MSW handlers + controller (latency / failure modes)
src/domain/               pure TypeScript, no React; most tests live here
  normalize.ts            API → UI models, visibility rule, data fixes, issue log
  pricing.ts              exact decimal pricing (big.js), display rounding
  urlState.ts             URL ⇄ FilterState (parse, canonical serialise, consistency rules)
  search.ts               tokenising, matching, relevance score
  results.ts              filtering, facet counts, sorting, grouping, pagination, relaxations
src/features/explorer/    React components
src/hooks/                URL state, online status, media query, debounce
```

Data flows one way: the **URL** gives a `FilterState`, the three queries give a normalised `Catalog`, and
`computeResults(catalog, state)` returns the page, the facet counts and the totals. React only renders that. Adding
a filter means one predicate and one count in `results.ts`, one URL field in `urlState.ts`, and one section in
`FilterPanel.tsx`.

### Stack choices

- **React 19 + TypeScript + Vite.** The brief prefers Next.js. I used Vite to keep the mock-API story simple
  (MSW in the browser), and because a client-only page makes “no flash of an unfiltered list” easy to guarantee:
  the URL is read synchronously before the first render.
- **MSW** for the mock API. Components call `fetch('/api/service')` exactly as they would in production. The same
  handlers run in Node for the tests. The 2 MB fixture is loaded lazily, in its own chunk.
- **TanStack Query** for fetching: caching, a retry, paused-while-offline, and stale data kept on refetch failure.
- **big.js** for money. Prices are decimal strings and the brief forbids rounding mid-calculation. Floats get
  cases like `1.005` wrong, and there are 32 visible non-wellness prices in the data with more than 2 decimals.
- **No router, CSS framework or component library.** It's one page: a ~40-line `useUrlState` hook over the History
  API replaces a router. A native `<dialog>` gives the mobile drawer its focus trap, Escape handling and inert
  background. The CSS is plain, with custom properties. Fewer dependencies, less to explain.
- Pinned to Vite 7, Vitest 3 and MSW 2 (newer majors exist) because I know their APIs well.

## Key decisions

### Visibility

A service is shown only if its own `status` is `true`, its provider's `status` is `"active"`, and its category, if
it has one, is active. After that rule, **2,853 of 3,200 services from 64 of 67 providers** remain. Hidden services
never appear in counts, facets or search. Subcategories are treated like categories: an inactive subcategory hides
its services. None in the data are inactive.

### Facet counts

`computeResults` makes **one pass** over the services, checking each against seven filter dimensions (search, type,
category, provider, location, price, home test):

- passes all of them: it's a result, and it counts towards every facet;
- fails exactly one: it would become a result if that one filter changed, so it counts towards **that facet's
  options only**;
- fails two or more: it counts nowhere.

That's exactly “how many results this option would give, with all the *other* filters as they are”, in O(services
× dimensions) and without a separate filtering pass per facet. A test checks every option's count against a
brute-force recount over 40 generated multi-filter states.

**Within a facet:**

- **Single-select facets** (category tree, location, currency): the count is exactly the number of results you'd
  get after choosing that option.
- **Multi-select facets** (type, provider): options combine with OR. A count is how many results have that value,
  so the number of results *added* by ticking it. It is not the new total. That's the standard reading on most
  faceted search sites, and the sum of the selected options' counts equals the total.

**Zero-result options are disabled, not hidden.** Hiding makes the list jump around on every change (layout shift,
and you lose your place with the keyboard). It also hides the fact that an option exists at all, e.g. that Pokhara
is a city we cover. Disabled options keep their place, show 0, and are struck through and greyed out. A selected
option is never disabled, so it can always be unticked. In the provider list, disabled providers sink to the bottom
so the search stays useful.

### The two “ultrasound” categories

Category slugs are only unique within a type, so the URL stores the **type and slug**:
`category=package:ultrasound` vs `category=lab_test:ultrasound`. Subcategories are keyed under their parent, so the
three “thyroid” subcategories (two Ultrasounds and Blood Tests) never collide. Where two categories share a title,
the label names the type: “Ultrasound (Health package)” and “Ultrasound (Lab test)”.

### Prices and currencies

- **Formula.** As in the brief, computed exactly with big.js, rounded half-up to 2 decimals **only** in
  `formatMoney`. Amounts are always shown with their currency code (`THB 5,970.60`), because one page can show three
  currencies.
- **Discounts.** The original is struck through, with visually hidden “Was … now …” text, because screen readers
  don't announce `<del>`.
- **Wellness.** No single price. One duration shows `THB 1,800.00 · 60 min`. Several show the cheapest one, labelled
  as a starting price: “Signature Facial” reads `From THB 1,800.00 · 60 min` plus “2 durations, 60–90 min”.
- **The price filter never mixes currencies.** A range always belongs to one currency.
  - When every result is already in one currency (say “Bangkok” is selected), the Min/Max fields apply to it
    directly and are labelled “Max (THB)”.
  - Otherwise they are disabled, with an explanation that results span several currencies and we don't convert, and
    the customer first picks *Only THB / NPR / INR prices*. Each option shows its count.
  - Picking a currency is itself a filter: it shows only that currency's services. That's the honest consequence of
    having no exchange rates.
  - The range compares **final** prices, and a wellness service matches if **any** of its durations is in range.
- **Sorting by price** can't compare across currencies either. With mixed currencies, results are grouped into one
  section per currency (the currency with the most results first), each sorted on its own, with a note explaining
  why.
  - Cards are ordered by their cheapest matching service (low to high) or their most expensive (high to low).
  - Services inside a card are sorted by price.
  - A wellness service sorts by its lowest option.
- **Home tests.** The home-visit fee isn't part of the formula, so it's shown next to the price
  (“Home test available · THB 331.00 home visit fee”) and not added into it.

### Sorting: “Best match” (relevance)

- **With a search:** services are scored by where each word matched. Title at the start of a word = 3, elsewhere
  in the title = 2, category = 1.5, provider name = 1, and +3 when the whole phrase is in the title. Cards are
  ordered by their best-scoring service.
- **Ties, and the no-search case:** cards go by a review-weighted rating, i.e. a Bayesian average with a prior of
  100 reviews at the overall mean. That way 4.8 from 5 reviews doesn't beat 4.6 from 1,000. New, unrated
  providers get the mean: neither promoted nor buried.
- **“Rating”** sorts by the raw rating, then review count. Unrated providers come last.

### Search

Each word must appear in the service title, the provider name or the category/subcategory names (AND across words,
any field per word). Matching is case-, accent- and whitespace-insensitive.

### URL

Every filter, the sort and the page are in the query string, e.g.
`?q=thyroid&type=lab_test&category=lab_test:ultrasound&sub=thyroid&city=bangkok&currency=THB&max=5000&home=1&sort=price_asc&page=2`.

- **Canonical form.** `serializeFilters` uses a fixed parameter order, sorted lists and leaves defaults out, so one
  view has exactly one URL.
- **Validation.** `parseFilters` drops anything invalid (unknown types, bad numbers, `page=-3`) instead of failing.
  A reversed min/max is swapped, and a range without a currency is ignored.
- **History.** Discrete changes push a history entry, so back and forward step through filter changes. Typing a
  search replaces the current entry, so a search is one entry rather than one per keystroke.
- **Consistency rules.** Any filter change returns to page 1, changing the category clears the subcategory, and a
  page beyond the last one is clamped and written back to the URL.
- **Links to things that no longer exist.** An unknown provider in a shared link shows as a removable chip, and the
  empty state offers to remove it.

### Results layout

- Pages hold 10 provider cards.
- A card shows up to 3 matching services (sorted as above) and a “View all 14 matching services” button. The
  number reflects the active filters.
- “View all” sets the provider filter to that provider. The view stays shareable, the back button returns to the
  previous one, and with a single provider on screen the card lists every service.

### Page states

| State                      | What the customer sees                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Loading                    | Skeleton cards with the same dimensions as the real ones, plus “Loading services…”      |
| Slow (over 3 s)            | “This is taking longer than usual…”, skeletons stay                                     |
| Offline before load        | Queries pause: “You’re offline. We’ll load services as soon as you’re back online.” They resume by themselves. |
| Offline after load         | Banner: you can keep filtering what's loaded; prices may have changed                  |
| API failure                | Says *which* part failed, plus “Try again”. Only the failed requests are retried.        |
| Refresh failed (partial)   | The last good data stays, with a banner showing when it's from and “Try again”          |
| Empty                      | One button per active filter, e.g. “Remove the price range”, each showing the exact number of results it would bring back, plus “Clear all filters” |
| Unpriceable service        | “Price unavailable · Contact the provider for a quote”                                  |

All three collections are needed to apply the visibility rule (provider and category status), so we never show a
list built from only some of them. A “partial” list could contain services that must be hidden.

### Mobile

Below 60 em, filters live in a drawer (a native modal `<dialog>`) opened by a “Filters (n)” button.

- Changes in the drawer are a **draft**: the URL and the results behind it only change on apply.
- The apply button reads, e.g., “Show 616 results” after ticking Wellness. It's computed by the same `computeResults` on the draft, so it's
  always correct before the customer commits.
- Close or Escape discards the draft, and focus returns to the Filters button.

### Accessibility

- **Keyboard:** everything is a native control (checkboxes, radios, a select, buttons), so it all works by keyboard.
  There's a skip link to the results, and a visible focus ring everywhere.
- **Grouping:** filter groups are `fieldset`/`legend`.
- **Counts:** read out as “Lab test, 1,155 results”. Unavailable options are disabled (and announced as such).
- **Announcements:** result-count changes are announced through a polite live region, debounced by 600 ms so typing
  doesn't trigger a stream of announcements, e.g. “2,853 services from 64 providers, page 1 of 7”.
- **Focus:** after changing page, “View all”, an empty-state suggestion or “Clear all”, focus moves to the results
  heading.
- **Ratings** read as “Rated 4.7 out of 5 (1,203 reviews)”. Unrated providers show “New · no reviews yet”.
- **Contrast:** checked against WCAG AA. Every text colour pairing is at least 5.75:1 (muted text 6.8:1, the primary
  colour 7.2:1 on white), and input borders are 3.8:1 (non-text contrast needs 3:1). The pulsing skeleton animation
  is turned off under `prefers-reduced-motion`.

### Performance

- **Work per change.** All filtering, faceting and sorting runs on the client over the normalised 2,853 services,
  i.e. one request per collection, not per filter change.
- **Input never blocks.** The search box is a controlled input over local state. The URL updates immediately, and
  the heavy work reads `useDeferredValue(state)`, so React drops stale renders while you type.
- **No layout shift:**
  - skeletons match card dimensions;
  - facet options are disabled rather than removed;
  - counts use tabular figures;
  - the results area has a minimum height, and `scrollbar-gutter: stable` stops width jumps;
  - while new results compute, the old ones stay on screen instead of blanking.

**How I measured it.** I timed the domain functions with `performance.now()` in Vitest, under Node 24 on an Apple M2,
averaged over 50 runs after a warm-up:

| Operation                                        | Time      |
| ------------------------------------------------ | --------- |
| `normalizeCatalog` (once, after loading)         | 12.5 ms   |
| `computeResults`, no filters (64 cards, all facets) | 1.2 ms |
| `computeResults`, 5 filters + 2-word search      | 0.5 ms    |
| `computeResults`, price sort across currencies   | 1.7 ms    |
| `computeResults`, typing “h” → “health”          | 1.7 → 0.6 ms per keystroke |

That's about 1–2 % of the 100 ms budget, so there's plenty of headroom for a mid-range laptop.

In development, every computation is also recorded as a `computeResults` entry in the DevTools Performance panel
(Timings track) through `performance.measure`, alongside React's render time.

`results.test.ts` has a coarse regression guard (under 50 ms per run).

> **Still to do: browser profiling.** Record a Performance trace while toggling filters and typing on a throttled
> CPU (4×), and run Lighthouse for CLS. Add the numbers here.

## Data decisions

`normalizeCatalog` logs every issue it works around (`catalog.issues`). What I found, and what the customer sees:

| # | In the data | Decision |
|---|---|---|
| 1 | **“Vitamin D Test”** (`…0005`, Riverside, THB): price 450.00, *amount* discount 600.00, so the formula gives **−150.00** | Shown as **“Price unavailable · Contact the provider for a quote”**. Excluded from price ranges, and sorted last by price. A negative price is impossible, and clamping to 0 would advertise a free test nobody offered. Showing the undiscounted 450 would ignore data we have. The service stays visible because it's real and active. The same rule covers a percent discount over 100 % and any negative input. |
| 2 | **“Free Dental Consultation”** (`…0006`): price 0.00 | Genuinely free: shown as **“Free”**, and matches a price range starting at 0. |
| 3 | Title **`"  hba1c   TEST (Diabetes) "`** (`…0007`) | Whitespace trimmed and collapsed. **Casing left as is**: “HbA1c” can't be recovered mechanically, and title-casing would mangle other abbreviations. Search ignores case anyway. |
| 4 | Inactive service at an active provider (`…0004`) plus 197 others with `status: false` | Hidden (visibility rule). |
| 5 | Category **“Seasonal Offers”** is inactive, with 43 active services | Category and its services hidden. |
| 6 | Providers **161 Saffron Medical Centre** and **162 Saffron Diagnostics** are inactive, with 108 active services | Hidden; they don't appear as provider or location options. |
| 7 | Provider **163 Golden Mile International Hospital** is active with no services | Not listed as a provider option, since it could only ever show 0. |
| 8 | 5 providers with `rating: null` and `reviewCount: 0` | “New · no reviews yet”. Last when sorting by rating; the average rating in “Best match”. A rating with zero reviews would also be treated as unrated (none in the data). |
| 9 | 22 services with no category (20 visible) | Visible, as the rule says (“if it has one”). They match search by title and provider, but not a category filter. |
| 10 | 32 visible non-wellness prices with more than 2 decimals after the formula (e.g. INR 60,401.50) | Exact decimal maths, rounded half-up only for display. |
| 11 | Same title more than once at a provider (747 groups in the raw data) | **Not** duplicates: none are identical, they differ in price, category or durations. All are shown. |
| 12 | 2 providers whose `username` differs from `providerInformation.slug` (`&` in the name) | Irrelevant to the UI; we key on `id`. |
| 13 | `providerInformation.companyName` vs `name` | Equal throughout; `companyName` is preferred if present. |

Defensive handling also covers cases that aren't in the data: unknown provider or category references (hidden and
logged), a subcategory that doesn't belong to its category (kept under the category), an unsupported currency
(provider hidden), and a wellness service with no usable options (“Price unavailable”).

A note on the brief's story: **only one Bangkok hospital (Riverside) has health check-ups under 5,000 THB**, 4 of
them. Kailash Medical Centre's check-ups are all above 5,000. To compare a few hospitals side by side, the customer
has to raise the limit. The empty-state and chip patterns make that easy, and a test documents it.

## Tests

`npm test` runs 72 tests:

- **`pricing.test.ts`**:
  - the formula on every seeded record;
  - percent-on-percent;
  - no intermediate rounding;
  - invalid and negative prices, free services;
  - wellness options;
  - display rounding (`1.005 → 1.01`).
- **`normalize.test.ts`**: the visibility rule, the two ultrasounds, unrated providers, title clean-up, the issue
  log, and defensive references.
- **`urlState.test.ts`**: round-trips, canonical form, junk input, price rules, consistency rules.
- **`results.test.ts`**:
  - **facet counts against a brute-force recount over 40 multi-filter states**;
  - the brief's Bangkok/Lab-test example;
  - ultrasound and thyroid separation;
  - currency-scoped price filtering;
  - the customer story;
  - search and relevance;
  - price and rating sorting;
  - pagination;
  - empty-state suggestions;
  - a performance guard.
- **`ExplorerPage.test.tsx`**, the whole app through MSW:
  - skeletons, then the URL's view (never unfiltered);
  - error state naming the failed part, then retry;
  - URL writes and the back button;
  - facet counts and disabled options;
  - the empty-state way out;
  - “View all”;
  - the price filter in a single-currency view;
  - live-region announcements;
  - the mobile drawer's pending count, apply, discard and focus return.
- **`client.test.ts`**: the mock API endpoints and failure modes.

## Left out, and what I'd do next

- **Side-by-side comparison** (from the story): pick 2–3 services and compare them in a table. Same-currency only,
  for the same reason as the price filter.
- **Facet counts in a Web Worker.** Not needed at 3,200 services (about 1 ms), but it would be the next step at
  10–100×. Beyond that, the counts should come from the server.
- **Server-side filtering and pagination** against a real API. The domain layer is pure, so it could move behind an
  endpoint unchanged.
- **Real-browser end-to-end tests** (Playwright): keyboard-only walkthrough, axe checks, the service-worker path, a
  real `<dialog>`, and visual regression for layout shift.
- **Multi-select categories and locations.** I chose single-select trees so a count always means exactly “results
  after choosing this”.
- **A price slider.** The two inputs are more precise and more accessible. A slider with a histogram per currency
  would be a nice addition.
- **Remembering the last-used currency** for the price filter.
- **Localisation** (Thai, Nepali, Hindi) and locale-aware number formatting. Currently `en` everywhere.
- **Dark mode**, a design-system pass and real imagery.

## Where AI was used

<!-- Adjust this section so it accurately describes how you worked. -->

I used Claude Code (Anthropic) as a pair programmer for:

- profiling the JSON to find the data issues;
- scaffolding the project;
- drafting the domain modules, components and tests;
- drafting this README.

I reviewed, ran and adjusted all of it. The data decisions, the currency design and the facet-counting approach were
discussed and agreed before implementation, and I can explain every line.
