# Defect Log

Every defect below is linked to a test through `expectKnownDefect('<ID>')`. Run the suite to reproduce it.
Severity reflects impact on a real customer if the persona represented production behaviour.

---

### SD-01: Order summary shows unrounded floating-point totals

- **Severity:** Medium (affects the _standard_ user and erodes trust at the point of payment)
- **Steps:** log in as `standard_user` → add Onesie, Fleece Jacket, Bolt T-Shirt, Bike Light, Backpack → checkout → enter details → Continue.
- **Expected:** `Item total: $113.95`
- **Actual:** `Item total: $113.94999999999999`
- **Likely cause:** prices are summed as IEEE-754 floats and rendered without formatting to 2 dp.
- **Test:** `tests/ui/checkout.spec.ts`, "order summary shows money with exactly two decimals"

### SD-02: Product images replaced by a 404 placeholder

- **Severity:** High for `problem_user` (all 6 images); Medium for `visual_user` (Backpack only)
- **Evidence:** `src` is `/assets/sl-404-*.jpg`. The placeholder _loads successfully_, so checks like `naturalWidth > 0` pass. The test instead asserts that each image is unique and isn't the placeholder.
- **Test:** `tests/ui/personas.spec.ts`, "shows a distinct, real image per product"

### SD-03: Sorting has no effect

- **Users:** `problem_user`, `error_user`
- **Steps:** choose "Price (high to low)".
- **Actual:** the grid order doesn't change.
- **Test:** `personas.spec.ts`, "sorts by price high → low"

### SD-04: Cart add/remove is broken

- **Users:** `problem_user`, `error_user`
- **Actual:** only 2 of 6 "Add to cart" buttons work; "Remove" doesn't decrement the badge.
- **Test:** `personas.spec.ts`, "can fill and empty the cart"

### SD-05: Last Name input overwrites First Name

- **User:** `problem_user`
- **Actual:** typing a last name replaces the First Name value; Last Name stays empty; Continue fails with "Last Name is required".
- **Test:** `personas.spec.ts`, "can complete a purchase"

### SD-06: "Finish" doesn't complete the order

- **User:** `error_user`
- **Notes:** Last Name also can't be entered, yet Continue still proceeds. That means the required-field validation is bypassed, which is a second defect.
- **Test:** `personas.spec.ts`, "can complete a purchase"

### SD-07: Login exceeds the performance budget

- **User:** `performance_glitch_user`
- **Measured:** ~5.1 s from submit to inventory visible (budget 2 s).
- **Test:** `personas.spec.ts`, "logs in within the performance budget"

### SD-08: Inventory prices don't match the catalog or checkout

- **User:** `visual_user`
- **Actual:** grid prices are random (e.g. Backpack $8.62) and re-randomise on each render, so a price sort _looks_ unsorted. Cart and checkout show the correct prices.
- **Impact:** the price advertised differs from the price charged.
- **Test:** `personas.spec.ts`, "shows catalog prices" and "sorts by price high → low"

---

### SEC-01: Tampered JWT causes HTTP 500 instead of 401

- **Severity:** Medium (security hygiene)
- **Steps:** `POST /auth/login` → change the last 4 characters of `accessToken` → `GET /auth/me` with that token.
- **Expected:** `401 Unauthorized`
- **Actual:** `500 {"message":"invalid signature"}`. A garbage token correctly returns 401, so signature-verification errors aren't handled. 5xx on auth input inflates error budgets and leaks implementation detail.
- **Test:** `tests/api/auth.spec.ts`, "protected endpoint rejects a tampered token with 401, not a server error"

### DQ-01: Availability status isn't determined by stock

- **Evidence:** products with `stock = 7` are labelled "Low Stock" (ids 15, 64, 189) and "In Stock" (ids 58, 88, 136).
- **Impact:** customers see inconsistent urgency signals; downstream reporting on low-stock items is unreliable.
- **Test:** `tests/api/data-integrity.spec.ts`, "availabilityStatus is a deterministic function of stock"

### DQ-02: "In Stock" products can't be purchased

- **Evidence:** 8 "In Stock" products where `minimumOrderQuantity > stock`, e.g. id 20 (stock 10, MOQ 46), id 58 (stock 7, MOQ 36).
- **Impact:** the listing invites an order that can never be fulfilled.
- **Test:** `tests/api/data-integrity.spec.ts`, "\"In Stock\" products can satisfy their own minimum order quantity"
