// netlify/functions/send-monthly-invoices.js
//
// ════════════════════════════════════════════════════════════════
//  SETUP STEPS:
//  1. Create a free account at resend.com
//  2. Add and verify your domain (newtraildesign.com)
//  3. Create an API key in Resend dashboard
//  4. In Netlify → Site settings → Environment variables, add:
//       RESEND_API_KEY   = re_xxxxxxxxxxxx   (from Resend)
//       FIREBASE_DB_URL  = https://newtraildb-default-rtdb.firebaseio.com
//       FIREBASE_SECRET  = your Firebase database secret
//                          (Firebase Console → Project settings →
//                           Service accounts → Database secrets)
//
//  5. Add this file to your repo at: netlify/functions/send-monthly-invoices.js
//  6. Add a netlify.toml at repo root with:
//
//     [build]
//       functions = "netlify/functions"
//
//     [[plugins]]
//       package = "@netlify/plugin-emails"
//
//     [functions."send-monthly-invoices"]
//       schedule = "0 9 1 * *"    # Runs at 9am on the 1st of every month
//
// ════════════════════════════════════════════════════════════════

const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

function httpsPost(hostname, path, data, headers) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, headers)
    }, (res) => {
      let d = '';
      res.on('data', (chunk) => d += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch(e) { resolve({ status: res.statusCode, body: d }); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function genInvoiceNumber(fbKey) {
  return 'NTD-' + fbKey.replace(/[^a-zA-Z0-9]/g,'').substring(0,6).toUpperCase();
}

function buildEmailHtml(project, fbKey, invoiceNum, today, dueDate) {
  const hostingLabel = project.hosting === '50' ? 'Hosting + Backend'
    : project.hosting === '35' ? 'Backend & database'
    : project.hosting === '20' ? 'Hosting'
    : 'Monthly service';

  const amount = parseFloat(project.hosting || 0).toFixed(2);
  const payUrl = 'https://newtraildesign.com/payment?name=' + encodeURIComponent(project.client || '') +
    '&email=' + encodeURIComponent(project.email || '') +
    '&project=' + encodeURIComponent(project.name || '') +
    '&hosting=' + encodeURIComponent(project.hosting || '') +
    '&invoice=' + encodeURIComponent(invoiceNum);

  const invoiceUrl = 'https://newtraildesign.com/invoice?fbkey=' + encodeURIComponent(fbKey);

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f6f9;font-family:'IBM Plex Sans',Arial,sans-serif;font-size:15px;color:#13182b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e4ec">

        <!-- Header -->
        <tr><td style="background:#13182b;padding:32px 40px">
          <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:white">
            New Trail <span style="color:#a5b4fc">Design</span>
          </div>
          <div style="font-size:13px;color:#94a3b8;margin-top:4px">Monthly invoice</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 40px">
          <p style="margin:0 0 24px">Hi ${project.client ? project.client.split(' ')[0] : 'there'},</p>
          <p style="margin:0 0 24px;color:#545b72">Here's your monthly invoice from New Trail Design for <strong style="color:#13182b">${project.name || 'your project'}</strong>.</p>

          <!-- Invoice box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f9;border-radius:10px;margin-bottom:28px">
            <tr><td style="padding:24px 28px">
              <div style="font-family:monospace;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8a90a6;margin-bottom:16px">Invoice ${invoiceNum}</div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:14.5px;color:#545b72;padding-bottom:10px">${hostingLabel}</td>
                  <td align="right" style="font-family:monospace;font-weight:700;font-size:14.5px;padding-bottom:10px">$${amount}</td>
                </tr>
                <tr>
                  <td colspan="2" style="border-top:2px solid #13182b;padding-top:12px">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-weight:700;font-size:15px">Total due</td>
                        <td align="right" style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#5848e0">$${amount}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <div style="font-size:13px;color:#8a90a6;margin-top:12px">Due by ${dueDate}</div>
            </td></tr>
          </table>

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
            <tr><td align="center" style="background:#edebfc;border-radius:12px;padding:24px">
              <p style="margin:0 0 14px;font-size:14px;color:#545b72">Pay securely online — all major cards accepted.</p>
              <a href="${payUrl}" style="display:inline-block;background:#5848e0;color:white;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;text-decoration:none">
                Pay $${amount} now →
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;color:#8a90a6">
            <a href="${invoiceUrl}" style="color:#5848e0">View full invoice online</a>
          </p>
          <p style="margin:0;font-size:13px;color:#8a90a6">
            Questions? Reply to this email or reach us at
            <a href="mailto:hello@newtraildesign.com" style="color:#5848e0">hello@newtraildesign.com</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f5f6f9;border-top:1px solid #e2e4ec;padding:18px 40px;font-size:12px;color:#8a90a6">
          New Trail Design LLC · newtraildesign.com<br>
          You're receiving this because you have an active monthly service. To cancel, contact us with 30 days notice.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

exports.handler = async function(event, context) {
  const RESEND_API_KEY  = process.env.RESEND_API_KEY;
  const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
  const FIREBASE_SECRET = process.env.FIREBASE_SECRET;

  if (!RESEND_API_KEY || !FIREBASE_DB_URL || !FIREBASE_SECRET) {
    return { statusCode: 500, body: 'Missing environment variables. Check RESEND_API_KEY, FIREBASE_DB_URL, FIREBASE_SECRET.' };
  }

  // Fetch all projects from Firebase
  let projects;
  try {
    const url = FIREBASE_DB_URL + '/projects.json?auth=' + FIREBASE_SECRET;
    projects = await httpsGet(url);
  } catch (err) {
    return { statusCode: 500, body: 'Firebase read failed: ' + err.message };
  }

  if (!projects || typeof projects !== 'object') {
    return { statusCode: 200, body: 'No projects found.' };
  }

  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const due = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dueStr = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const results = [];

  for (const [fbKey, project] of Object.entries(projects)) {
    // Only active projects with a monthly hosting plan and a valid email
    if (project.status !== 'active') continue;
    if (!project.hosting || parseFloat(project.hosting) <= 0) continue;
    if (!project.email || !project.email.includes('@')) continue;

    const invoiceNum = genInvoiceNumber(fbKey);
    const html = buildEmailHtml(project, fbKey, invoiceNum, todayStr, dueStr);

    try {
      const res = await httpsPost('api.resend.com', '/emails', {
        from:    'New Trail Design <hello@newtraildesign.com>',
        to:      [project.email],
        subject: invoiceNum + ' — Monthly invoice from New Trail Design',
        html,
      }, {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
      });

      results.push({ fbKey, client: project.client, email: project.email, status: res.status });
    } catch (err) {
      results.push({ fbKey, client: project.client, email: project.email, error: err.message });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ sent: results.length, results }),
  };
};
