const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // ── UAT 1: Login end-to-end ────────────────────────────────
  console.log('\n=== UAT 1: Login end-to-end ===');
  await page.goto('http://localhost:3000/login');
  console.log('Login page URL:', page.url());
  console.log('Page title:', await page.title());

  await page.fill('input[name="email"]', 'admin@demo.com');
  await page.fill('input[name="password"]', 'Admin123!');

  // Submit and wait for navigation
  await Promise.all([
    page.waitForURL(url => !url.toString().includes('/login'), { timeout: 8000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);

  await page.waitForTimeout(2000);
  const afterLoginUrl = page.url();
  console.log('After login URL:', afterLoginUrl);

  const cookiesAfterLogin = await context.cookies();
  const sessionCookie = cookiesAfterLogin.find(c => c.name.includes('authjs') || c.name.toLowerCase().includes('session'));
  console.log('Session cookie:', sessionCookie ? `✓ ${sessionCookie.name} (httpOnly=${sessionCookie.httpOnly})` : '✗ NOT FOUND');
  console.log('All cookies:', cookiesAfterLogin.map(c => c.name).join(', '));

  const uat1Pass = !afterLoginUrl.includes('/login') && !!sessionCookie;
  console.log('UAT 1:', uat1Pass ? '✓ PASS' : '✗ FAIL', `- redirected=${!afterLoginUrl.includes('/login')} cookie=${!!sessionCookie}`);

  // ── UAT 2: Logout cookie clearing ─────────────────────────
  console.log('\n=== UAT 2: Logout ===');
  const cookiesBefore = (await context.cookies()).filter(c => c.name.includes('authjs') || c.name.toLowerCase().includes('session'));
  console.log('Cookies before logout:', cookiesBefore.map(c => c.name).join(', ') || 'none');

  // Navigate to signout page
  await page.goto('http://localhost:3000/api/auth/signout');
  await page.waitForTimeout(500);
  console.log('Signout page URL:', page.url());

  // Look for and click sign out button
  const signOutForms = await page.locator('form').count();
  console.log('Signout forms found:', signOutForms);
  if (signOutForms > 0) {
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.count() > 0) {
      await Promise.all([
        page.waitForTimeout(2000),
        submitBtn.click(),
      ]);
    }
  }

  await page.waitForTimeout(1500);
  console.log('After signout URL:', page.url());
  const cookiesAfterLogout = await context.cookies();
  // Only check for the session-token — callback-url is a non-auth redirector cookie
  const sessionAfterLogout = cookiesAfterLogout.find(c => c.name === 'authjs.session-token' || c.name === '__Secure-authjs.session-token');
  console.log('Session cookie after logout:', sessionAfterLogout ? `still present: ${sessionAfterLogout.name}` : '✓ authjs.session-token cleared');
  console.log('Remaining cookies:', cookiesAfterLogout.map(c => c.name).join(', ') || 'none');

  const uat2Pass = !sessionAfterLogout;
  console.log('UAT 2:', uat2Pass ? '✓ PASS' : '✗ FAIL');

  await browser.close();

  // ── UAT 3: Cross-tenant isolation (Express API) ───────────
  console.log('\n=== UAT 3: Cross-tenant isolation ===');
  // We only have one empresa in the seed, so we test that a made-up obraId returns 404
  // We need a valid session token for the API - re-login and get cookie
  const context2 = await (await chromium.launch({ headless: true })).newContext();
  const page2 = await context2.newPage();
  await page2.goto('http://localhost:3000/login');
  await page2.fill('input[name="email"]', 'admin@demo.com');
  await page2.fill('input[name="password"]', 'Admin123!');
  await Promise.all([
    page2.waitForURL(url => !url.toString().includes('/login'), { timeout: 8000 }).catch(() => {}),
    page2.click('button[type="submit"]'),
  ]);
  await page2.waitForTimeout(1500);
  const cookies2 = await context2.cookies();
  // Must use session-token, not callback-url
  const sessionCookie2 = cookies2.find(c => c.name === 'authjs.session-token' || c.name === '__Secure-authjs.session-token');
  console.log('All cookies2:', cookies2.map(c=>c.name).join(', '));
  console.log('Got session for API tests:', sessionCookie2 ? `✓ ${sessionCookie2.name}` : '✗ none');

  if (sessionCookie2) {
    // Test: access a non-existent obra (should be 404 - tenant isolation)
    const fakeObraId = 'fake-obra-id-from-another-tenant';
    const resp = await page2.request.get(`http://localhost:4000/api/obras/${fakeObraId}`, {
      headers: {
        'Cookie': `${sessionCookie2.name}=${sessionCookie2.value}`,
      }
    });
    console.log(`GET /api/obras/${fakeObraId} → HTTP ${resp.status()}`);
    const body = await resp.text();
    console.log('Response:', body.substring(0, 200));
    const uat3Pass = resp.status() === 404;
    console.log('UAT 3:', uat3Pass ? '✓ PASS' : `✗ FAIL (got ${resp.status()} instead of 404)`);
  } else {
    console.log('UAT 3: SKIP (no session cookie)');
  }

  await context2.close();

  // ── UAT 4: SUSPENSO empresa rejection ─────────────────────
  console.log('\n=== UAT 4: SUSPENSO empresa rejection ===');
  // Set empresa to SUSPENSO using exec
  const { execSync } = require('child_process');
  try {
    execSync(`docker exec cargo-sentinel-postgres-1 psql -U sentinel -d cargo_sentinel -c "UPDATE \\"Empresa\\" SET status = 'SUSPENSO' WHERE cnpj = '00000000000191';"`, { stdio: 'pipe' });
    console.log('✓ Set empresa to SUSPENSO');

    const browser4 = await chromium.launch({ headless: true });
    const ctx4 = await browser4.newContext();
    const pg4 = await ctx4.newPage();
    await pg4.goto('http://localhost:3000/login');
    await pg4.fill('input[name="email"]', 'admin@demo.com');
    await pg4.fill('input[name="password"]', 'Admin123!');
    await pg4.click('button[type="submit"]');
    await pg4.waitForTimeout(3000);

    const url4 = pg4.url();
    const pageContent = await pg4.content();
    const hasError = pageContent.includes('Credenciais inválidas') || pageContent.includes('suspensa') || url4.includes('error') || url4.includes('login');
    console.log('After login attempt URL:', url4);
    console.log('Error message visible:', hasError);
    const uat4Pass = url4.includes('/login') || hasError;
    console.log('UAT 4:', uat4Pass ? '✓ PASS' : '✗ FAIL');

    await browser4.close();

    // Restore ATIVO
    execSync(`docker exec cargo-sentinel-postgres-1 psql -U sentinel -d cargo_sentinel -c "UPDATE \\"Empresa\\" SET status = 'ATIVO' WHERE cnpj = '00000000000191';"`, { stdio: 'pipe' });
    console.log('✓ Restored empresa to ATIVO');
  } catch (err) {
    console.log('UAT 4 error:', err.message);
  }

  console.log('\n=== ALL UAT DONE ===');
})().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
