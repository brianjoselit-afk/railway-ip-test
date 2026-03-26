const http = require('http');
const { chromium } = require('playwright');

const PORT = process.env.PORT || 3000;
const LOGIN_URL = 'https://login.cgt.us/cas/login?service=https%3A%2F%2Freporting.lucenthealth.com%2Flogin%2Fcas';
const PROXY_URL = process.env.PROXY_URL || '';

let running = false;

async function runLoginTest() {
  const log = [];
  const push = (msg) => { console.log(msg); log.push(msg); };

  push(`[${new Date().toISOString()}] Starting login test from Railway...`);

  if (!PROXY_URL) {
    push('');
    push('❌ PROXY_URL not set!');
    push('   Set it in Railway Variables, e.g.:');
    push('   http://railway:MonitorProxy2026!@brianjoselit.duckdns.org:8888');
    return { success: false, log };
  }

  push(`[1/5] Proxy: ${PROXY_URL.replace(/:[^:@]+@/, ':****@')}`);

  let browser;
  try {
    push('[2/5] Launching Chromium with proxy...');
    browser = await chromium.launch({
      headless: true,
      proxy: { server: PROXY_URL }
    });
    const page = await browser.newPage();

    push(`[3/5] Navigating to login page (via home proxy)...`);
    push(`      URL: ${LOGIN_URL}`);
    const navResponse = await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 45000 });
    const navStatus = navResponse ? navResponse.status() : 'unknown';
    push(`      HTTP status: ${navStatus}`);
    push(`      Final URL: ${page.url()}`);

    if (navStatus === 403) {
      push('');
      push('❌ Still getting 403 — proxy may not be working correctly.');
      return { success: false, blocked: true, log };
    }

    if (navStatus !== 200) {
      push(`⚠️  Unexpected status ${navStatus} — continuing...`);
    }

    push('[4/5] Looking for login form...');
    const usernameField = page.getByRole('textbox', { name: 'Username *' });
    const passwordField = page.getByRole('textbox', { name: 'Password *' });
    const loginButton = page.getByRole('button', { name: 'Login' });

    const hasForm = await usernameField.count() > 0 &&
                    await passwordField.count() > 0 &&
                    await loginButton.count() > 0;

    if (!hasForm) {
      const title = await page.title();
      push(`      Page title: ${title}`);
      push('');
      push('❌ Login form not found.');
      return { success: false, log };
    }

    push('      Login form found!');

    if (!process.env.SITE_USERNAME || !process.env.SITE_PASSWORD) {
      push('');
      push('✅ PROXY WORKING — Login page loaded through home internet!');
      push('   Set SITE_USERNAME and SITE_PASSWORD to test full login.');
      return { success: true, credentialsMissing: true, log };
    }

    push('[5/5] Filling credentials and clicking Login...');
    await usernameField.fill(process.env.SITE_USERNAME);
    await passwordField.fill(process.env.SITE_PASSWORD);
    await loginButton.click();

    try {
      await page.waitForURL('**/reporting.lucenthealth.com/**', { timeout: 30000 });
      push(`      Redirected to: ${page.url()}`);
      push('');
      push('✅ FULL LOGIN SUCCESSFUL through home proxy!');
      push('   Railway → Home Proxy → Lucent Health: working perfectly.');
      push('   Ready to deploy the full Report Monitor.');
      return { success: true, loggedIn: true, log };
    } catch (err) {
      push(`      Current URL: ${page.url()}`);
      push('');
      push('❌ Login failed — redirect did not happen.');
      return { success: false, log };
    }

  } catch (err) {
    push('');
    push(`❌ ERROR: ${err.message}`);

    if (err.message.includes('ERR_PROXY_CONNECTION_FAILED')) {
      push('');
      push('   Could not connect to the home proxy.');
      push('   Check: Is proxy.js running on your PC?');
      push('   Check: Is port 8888 forwarded on your AT&T router?');
      push('   Check: Is DuckDNS pointing to your home IP?');
      return { success: false, log };
    }

    if (err.message.includes('Timeout')) {
      push('   Request timed out through proxy.');
      push('   Check: Is the proxy running? Is port forwarding set up?');
    }

    return { success: false, log };
  } finally {
    if (browser) await browser.close();
  }
}

const HTML = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Railway IP Test — Home Proxy</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 680px; margin: 40px auto; padding: 0 20px; background: #0f1117; color: #e4e6ef; }
  h1 { font-size: 20px; color: #4f8ff7; }
  .btn { background: #4f8ff7; color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .btn:hover { background: #3a6fd8; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  pre { background: #1a1d27; padding: 16px; border-radius: 8px; font-size: 13px; line-height: 1.6; overflow-x: auto; white-space: pre-wrap; border: 1px solid #2e3240; }
  .pass { color: #34d399; } .fail { color: #f87171; } .warn { color: #fbbf24; }
  p { color: #8b8fa3; font-size: 14px; }
</style>
</head><body>
<h1>Railway → Home Proxy Test</h1>
<p>Tests Railway connecting to Lucent Health through your home internet.</p>
<button class="btn" id="btn" onclick="runTest()">Run proxy test</button>
<pre id="output">Click the button to test the proxy connection.\n\nChecklist before running:\n  1. proxy.js running on your PC\n  2. Port 8888 forwarded on AT&T router\n  3. DuckDNS subdomain set up\n  4. PROXY_URL set in Railway variables</pre>
<script>
async function runTest() {
  const btn = document.getElementById('btn');
  const out = document.getElementById('output');
  btn.disabled = true; btn.textContent = 'Running...';
  out.textContent = 'Connecting through home proxy...\\n';
  try {
    const res = await fetch('/test');
    const data = await res.json();
    let text = data.log.join('\\n');
    out.innerHTML = text
      .replace(/(✅.*)/g, '<span class="pass">$1</span>')
      .replace(/(❌.*)/g, '<span class="fail">$1</span>')
      .replace(/(⚠️.*)/g, '<span class="warn">$1</span>');
  } catch (e) {
    out.textContent = 'Request failed: ' + e.message;
  }
  btn.disabled = false; btn.textContent = 'Run again';
}
</script>
</body></html>`;

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
    return;
  }
  if (req.method === 'GET' && req.url === '/test') {
    if (running) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ log: ['Test already running, please wait...'] }));
      return;
    }
    running = true;
    try {
      const result = await runLoginTest();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ log: ['Server error: ' + err.message] }));
    } finally {
      running = false;
    }
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Railway Proxy Test running on port ${PORT}`);
  console.log(`Proxy: ${PROXY_URL ? PROXY_URL.replace(/:[^:@]+@/, ':****@') : 'NOT SET'}`);
});
