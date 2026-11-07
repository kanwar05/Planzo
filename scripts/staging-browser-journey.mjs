import { setTimeout as delay } from "node:timers/promises";

const expect = (condition) => { if (!condition) throw new Error("journey_assertion_failed"); };
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
async function eventually(operation) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await operation()) return;
    await delay(100);
  }
  throw new Error("journey_state_timeout");
}

// Runs against real React/Express endpoints. The harness supplies isolated
// accounts, SMTP capture and database assertions; no API response is mocked.
export async function runBrowserJourney({ browser, apiOrigin, accounts, runId, imageFile, mail, flushEmail, verifyDatabase, progress = () => {} }) {
  const checks = [];
  const metrics = { api: [], homepageNavigationMs: null };
  let password = accounts.customer.password;
  const customer = await browser.page();
  const vendor = await browser.page();
  const admin = await browser.page();
  let vendorId;
  let bookingId;
  const business = `Local rehearsal ${runId}`;
  const description = "A synthetic decoration business used only for the isolated local rehearsal.";
  let activeStep;
  const check = async (name, operation) => {
    activeStep = name;
    try {
      await operation();
      checks.push({ name, status: "pass" });
      progress({ name, status: "pass" });
    } catch (error) {
      checks.push({ name, status: "fail" });
      progress({ name, status: "fail", step: activeStep, category: /^[a-z_]+$/.test(error?.message || "") ? error.message : "check_failed" });
      throw new Error("workflow_check_failed");
    }
  };
  async function login(page, account, currentPassword = account.password) {
    await page.navigate("/login");
    await page.fill("#login-email", account.email);
    await page.fill("#login-password", currentPassword);
    await page.click("Log in");
    await page.wait("location.pathname !== '/login'");
  }
  async function booking(label, offset) {
    await customer.navigate(`/booking/${vendorId}`);
    await customer.fill('input[name="eventDate"]', day(offset));
    await customer.fill('input[name="eventType"]', label);
    await customer.fill('input[name="eventLocation"]', "Synthetic local rehearsal hall");
    await customer.click("Continue");
    await customer.fill('textarea[name="description"]', `Synthetic event ${label} for isolated browser verification.`);
    await customer.click("Review request");
    await customer.click("Send booking request");
    await customer.wait("document.body.textContent.includes('Request sent!')");
    const mine = await customer.api("/bookings/my-bookings");
    expect(mine.status === 200);
    return mine.body.bookings.find((item) => item.eventType === label);
  }
  try {
    await check("homepage_real_navigation", async () => {
      await customer.navigate("/");
      await customer.wait("Boolean(document.querySelector('h1'))");
      metrics.homepageNavigationMs = await customer.evaluate("Math.round(performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0)");
    });
    await check("customer_registration_and_httponly_cookies", async () => {
      await customer.navigate("/register");
      for (const [field, value] of Object.entries({ name: accounts.customer.name, email: accounts.customer.email, phone: "9876543210", password }))
        await customer.fill(`#register-${field}`, value);
      await customer.click("Create customer account");
      await customer.wait("location.pathname === '/customer/dashboard'");
      const cookies = (await customer.cookies()).filter((cookie) => cookie.name.startsWith("eventifyy_"));
      expect(cookies.length === 2 && cookies.every((cookie) => cookie.httpOnly));
      expect(!await customer.evaluate("document.cookie.includes('eventifyy_')"));
    });
    await check("password_login_logout_cookie_invalidation", async () => {
      await customer.click("Log out");
      expect((await customer.api("/auth/refresh", { method: "POST" })).status === 401);
      expect(!(await customer.cookies()).some((cookie) => cookie.name.startsWith("eventifyy_")));
      await login(customer, accounts.customer, password);
      expect((await customer.api("/auth/me")).status === 200);
    });
    await check("browser_session_refresh", async () => {
      const before = customer.responses.filter((response) => response.path === "/api/auth/refresh" && response.status === 200).length;
      await customer.expireCookies(["eventifyy_access"]);
      await customer.navigate("/customer/dashboard");
      await customer.wait("document.body.textContent.includes('My bookings')");
      expect(customer.responses.filter((response) => response.path === "/api/auth/refresh" && response.status === 200).length > before);
    });
    await check("browser_cookie_expiry_and_unauthorized_access", async () => {
      await customer.expireCookies(["eventifyy_access", "eventifyy_refresh"]);
      await customer.navigate("/customer/dashboard");
      await customer.wait("location.pathname === '/login'");
      expect((await customer.api("/bookings/my-bookings")).status === 401);
      await login(customer, accounts.customer, password);
    });
    await check("cookie_mutation_origin_csrf_protection", async () => {
      await customer.navigate(`${apiOrigin}/api/health`);
      expect((await customer.api("/auth/logout", { method: "POST" })).status === 403);
      expect((await customer.api("/auth/me")).status === 200);
      await customer.navigate("/customer/dashboard");
      await customer.wait("document.body.textContent.includes('My bookings')");
    });
    await check("email_otp_login_real_local_smtp", async () => {
      await customer.click("Log out");
      await customer.navigate("/login");
      await customer.click("Continue with Email OTP");
      await customer.fill("#login-email", accounts.customer.email);
      await customer.click("Send sign-in code");
      await customer.wait("Boolean(document.querySelector('#login-code'))");
      const message = await mail(accounts.customer.email, "Your Planzo Verification Code");
      const code = message.decoded.match(/verification code is:\s*(\d{6})/i)?.[1];
      expect(Boolean(code));
      await customer.fill("#login-code", code);
      await customer.click("Log in");
      await customer.wait("location.pathname === '/customer/dashboard'");
    });
    await check("password_recovery_browser_and_single_use_link", async () => {
      await customer.click("Log out");
      await customer.navigate("/forgot-password");
      await customer.fill("#recovery-email", accounts.customer.email);
      await customer.click("Send reset instructions");
      await customer.wait("document.body.textContent.includes('Check your inbox.')");
      const message = await mail(accounts.customer.email, "Reset your Planzo password");
      const link = message.decoded.match(/https?:\/\/[^\s<>]+\/reset-password\?token=[a-f0-9]+/i)?.[0];
      expect(Boolean(link));
      password = `${password}New1!`;
      await customer.navigate(link);
      await customer.fill("#reset-password", password);
      await customer.fill("#reset-confirmation", password);
      await customer.click("Reset password");
      await customer.wait("document.body.textContent.includes('Password changed.')");
      expect((await customer.api("/auth/reset-password", { method: "POST", body: { token: new URL(link).searchParams.get("token"), password } })).status === 400);
      await login(customer, accounts.customer, password);
    });
    await check("vendor_registration_and_profile_submission", async () => {
      await vendor.navigate("/register?role=vendor");
      for (const [field, value] of Object.entries({ name: accounts.vendor.name, email: accounts.vendor.email, phone: "9876543211", password: accounts.vendor.password, businessName: business, serviceCategory: "Decoration" }))
        await vendor.fill(`#register-${field}`, value);
      await vendor.click("Create vendor account");
      await vendor.wait("location.pathname === '/vendor/profile-setup'");
      for (const [label, value] of Object.entries({ "Service location": "Delhi", City: "Delhi", "Starting price (INR)": "12000", "Business description": description, "Services offered": "Wedding decoration", "Shared phone (optional)": "8888888888", "Shared email (optional)": "shared@example.invalid" }))
        await vendor.fillLabel(label, value);
      await vendor.click("Save business profile");
      await eventually(async () => {
        const result = await vendor.api("/vendors/me");
        vendorId = result.body.vendor?._id;
        return result.status === 200 && result.body.vendor.verificationStatus === "pending";
      });
    });
    await check("portfolio_ui_with_mock_cloudinary", async () => {
      await vendor.wait("Boolean(document.querySelector('input[type=file][multiple]'))");
      await vendor.upload('input[type="file"][multiple]', imageFile);
      await vendor.click("Upload 1 photos");
      await eventually(async () => (await vendor.api("/vendors/me")).body.vendor?.portfolioImages?.length === 1);
    });
    await check("admin_rejection_vendor_correction_and_resubmission", async () => {
      activeStep = "review_admin_login";
      await login(admin, accounts.admin);
      activeStep = "review_open_queue";
      await admin.navigate("/admin/vendors/unverified");
      await admin.wait(`document.body.textContent.includes(${JSON.stringify(business)})`);
      activeStep = "review_rejection_reason";
      await admin.fill('textarea[id^="review-reason-"]', "Please describe the available decoration services.");
      activeStep = "review_reject_click";
      await admin.click("Reject vendor", business);
      activeStep = "review_rejection_committed";
      await eventually(async () => (await vendor.api("/vendors/me")).body.vendor?.verificationStatus === "rejected");
      activeStep = "review_vendor_correction";
      await vendor.navigate("/vendor/profile-setup");
      await vendor.fillLabel("Business description", `${description} We offer floral and stage decoration.`);
      activeStep = "review_vendor_resubmit";
      await vendor.click("Save and resubmit for review");
      await eventually(async () => (await vendor.api("/vendors/me")).body.vendor?.verificationStatus === "pending");
    });
    await check("admin_approval_and_public_listing", async () => {
      await admin.navigate("/admin/vendors/unverified");
      await admin.wait(`document.body.textContent.includes(${JSON.stringify(business)})`);
      await admin.click("Approve vendor", business);
      await eventually(async () => (await customer.api(`/vendors/${vendorId}`)).status === 200);
    });
    await check("public_search_filters_and_contact_privacy", async () => {
      await customer.navigate("/vendors");
      await customer.fill("#vendor-search", business);
      await customer.click("Search");
      await customer.wait(`Boolean([...document.querySelectorAll('h3,h2')].find(item => item.textContent.includes(${JSON.stringify(business)})))`);
      const search = await customer.api(`/vendors?search=${encodeURIComponent(business)}&category=Decoration&city=Delhi&minPrice=10000&maxPrice=15000&page=1&limit=1`);
      expect(search.status === 200 && search.body.vendors.length === 1 && search.body.pagination.page === 1);
      expect(!search.body.vendors[0].contactDetails && !search.body.vendors[0].userId);
      metrics.api.push({ operation: "vendor_search", samples: 1, durationMs: search.elapsedMs });
      await customer.navigate(`/vendors/${vendorId}`);
      await customer.wait(`document.body.textContent.includes(${JSON.stringify(business)})`);
      const detail = await customer.api(`/vendors/${vendorId}`);
      expect(!detail.body.vendor.contactDetails);
      metrics.api.push({ operation: "vendor_detail", samples: 1, durationMs: detail.elapsedMs });
    });
    await check("booking_ui_pending_contacts_hidden_and_request_receipt", async () => {
      const created = await booking("Complete rehearsal", 14);
      bookingId = created._id;
      expect(created.status === "pending" && !created.vendorId.contactDetails);
      await flushEmail();
      expect(Boolean(await mail(accounts.vendor.email, "Planzo booking request received")));
    });
    await check("vendor_acceptance_customer_confirmation_and_shared_contacts", async () => {
      await vendor.navigate("/vendor/dashboard");
      await vendor.click("Accept", "Complete rehearsal");
      await eventually(async () => (await customer.api("/bookings/my-bookings")).body.bookings.find((item) => item._id === bookingId)?.status === "accepted");
      await flushEmail();
      expect(Boolean(await mail(accounts.customer.email, "Planzo booking accepted")));
      await customer.navigate("/customer/dashboard");
      await customer.wait("Boolean(document.querySelector('section[aria-label=\"Vendor contact details\"]'))");
      const accepted = (await customer.api("/bookings/my-bookings")).body.bookings.find((item) => item._id === bookingId);
      expect(accepted.vendorId.contactDetails?.email === "shared@example.invalid");
    });
    await check("vendor_completion_ui_and_receipt", async () => {
      await vendor.navigate("/vendor/dashboard");
      await vendor.click("Mark completed", "Complete rehearsal");
      await eventually(async () => (await customer.api("/bookings/my-bookings")).body.bookings.find((item) => item._id === bookingId)?.status === "completed");
      await flushEmail();
      expect(Boolean(await mail(accounts.customer.email, "Planzo booking completed")));
    });
    await check("vendor_rejection_ui_and_receipt", async () => {
      const created = await booking("Reject rehearsal", 15);
      await vendor.navigate("/vendor/dashboard");
      await vendor.click("Reject", "Reject rehearsal");
      await eventually(async () => (await customer.api("/bookings/my-bookings")).body.bookings.find((item) => item._id === created._id)?.status === "rejected");
      await flushEmail();
      expect(Boolean(await mail(accounts.customer.email, "Planzo booking request declined")));
    });
    await check("customer_cancellation_ui_and_both_receipts", async () => {
      const created = await booking("Cancel rehearsal", 16);
      await customer.navigate("/customer/dashboard");
      await customer.click("Cancel booking", "Cancel rehearsal");
      await eventually(async () => (await customer.api("/bookings/my-bookings")).body.bookings.find((item) => item._id === created._id)?.status === "cancelled");
      await flushEmail();
      expect(Boolean(await mail(accounts.customer.email, "Planzo booking cancelled")));
      expect(Boolean(await mail(accounts.vendor.email, "Planzo booking cancelled")));
    });
    await check("concurrent_acceptance_real_browser_cookie_requests", async () => {
      const created = [];
      for (let index = 0; index < 2; index += 1) created.push(await customer.api("/bookings", { method: "POST", body: {
        vendorId, eventType: `Concurrent rehearsal ${index}`, eventDate: day(17),
        eventLocation: "Synthetic rehearsal hall", description: "Isolated concurrency rehearsal request.",
      } }));
      expect(created.every((result) => result.status === 201));
      for (const result of created) metrics.api.push({ operation: "booking_submission", samples: 1, durationMs: result.elapsedMs, status: result.status });
      const ids = created.map((result) => result.body.booking._id);
      const began = performance.now();
      const results = await Promise.all(ids.map((id) => vendor.api(`/bookings/${id}/status`, { method: "PATCH", body: { status: "accepted" } })));
      expect(results.map((result) => result.status).sort().join(",") === "200,409");
      for (const result of results) metrics.api.push({ operation: "booking_acceptance", samples: 1, durationMs: result.elapsedMs, status: result.status });
      metrics.api.push({ operation: "concurrent_acceptance_pair", samples: 2, durationMs: Math.round(performance.now() - began) });
      for (const id of ids) expect((await customer.api(`/bookings/${id}/status`, { method: "PATCH", body: { status: "cancelled" } })).status === 200);
      await flushEmail();
    });
    await check("vendor_suspension_restore_and_public_eligibility", async () => {
      await admin.navigate("/admin/vendors/unverified");
      await admin.fillLabel("Approval status", "approved");
      await admin.wait(`document.body.textContent.includes(${JSON.stringify(business)})`);
      await admin.click("Suspend vendor account", business);
      await admin.fillLabel("Moderation reason", "Synthetic local suspension verification.");
      await admin.click("Confirm suspension");
      await eventually(async () => (await customer.api(`/vendors/${vendorId}`)).status === 404);
      expect([401, 403].includes((await vendor.api("/auth/me")).status));
      await admin.click("Restore vendor account", business);
      await admin.click("Confirm restoration");
      await eventually(async () => (await customer.api(`/vendors/${vendorId}`)).status === 200);
      await login(vendor, accounts.vendor);
    });
    await check("vendor_deactivation_ui_blocks_new_listing_access", async () => {
      await vendor.navigate("/vendor/settings");
      await vendor.fillLabel("Password to deactivate account", accounts.vendor.password);
      await vendor.evaluate("document.querySelector('input[type=checkbox]').click()");
      await vendor.click("Deactivate account");
      await vendor.wait("location.pathname === '/login'");
      expect((await customer.api(`/vendors/${vendorId}`)).status === 404);
      expect((await vendor.api("/auth/login", { method: "POST", body: { email: accounts.vendor.email, password: accounts.vendor.password } })).status === 403);
    });
    await check("database_and_outbox_consistency", async () => {
      metrics.database = await verifyDatabase({ vendorId });
      expect(metrics.database.completed === 1 && metrics.database.rejected === 1 && metrics.database.cancelled === 3);
      expect(metrics.database.pendingEmails === 0 && metrics.database.failedEmails === 0);
    });
  } catch { /* The failed fixed-name check is the only diagnostic returned. */ }
  return { checks, metrics };
}
