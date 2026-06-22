// netlify/functions/charge.js
//
// Set SQUARE_ACCESS_TOKEN in Netlify → Site configuration → Environment variables
// Never put the actual token value in this file.
//
// Requires square npm package — package.json at repo root must include:
//   { "dependencies": { "square": "^40.0.0" } }

const { Client, Environment } = require('square');

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Sandbox, // Change to Environment.Production when going live
});

exports.handler = async function(event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Handle CORS preflight
  const headers = {
    'Access-Control-Allow-Origin': 'https://newtraildesign.com',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  let data;
  try {
    data = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid request body' }) };
  }

  const { sourceId, amountCents, plan, monthlyAmountCents, customerEmail, customerName, businessName, locationId } = data;

  if (!sourceId || !amountCents || !customerEmail || !locationId) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing required fields' }) };
  }

  try {
    // Step 1 — Create customer record in Square
    const customerRes = await client.customersApi.createCustomer({
      emailAddress: customerEmail,
      givenName:    customerName ? customerName.split(' ')[0] : '',
      familyName:   customerName ? customerName.split(' ').slice(1).join(' ') : '',
      companyName:  businessName || undefined,
    });
    const customerId = customerRes.result.customer.id;

    // Step 2 — Charge the one-time amount (build fee + first month if applicable)
    const paymentRes = await client.paymentsApi.createPayment({
      sourceId,
      idempotencyKey: Date.now().toString() + '-' + Math.random().toString(36).slice(2),
      amountMoney:    { amount: BigInt(amountCents), currency: 'USD' },
      customerId,
      locationId,
      note: 'New Trail Design — ' + (plan !== 'none' ? 'App build + first month ' + plan : 'App build'),
    });

    if (paymentRes.result.payment.status !== 'COMPLETED') {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ success: false, error: 'Payment did not complete. Status: ' + paymentRes.result.payment.status })
      };
    }

    // Step 3 — Create recurring subscription if a monthly plan was chosen
    // To enable subscriptions, create subscription plans in your Square Dashboard
    // (Items → Subscription plans) and paste the Plan Variation IDs below.
    if (plan && plan !== 'none' && monthlyAmountCents > 0) {
      const PLAN_VARIATION_IDS = {
        hosting: 'YOUR_HOSTING_PLAN_VARIATION_ID',
        backend: 'YOUR_BACKEND_PLAN_VARIATION_ID',
        both:    'YOUR_BOTH_PLAN_VARIATION_ID',
      };

      const planVariationId = PLAN_VARIATION_IDS[plan];
      if (planVariationId && !planVariationId.startsWith('YOUR_')) {
        const startDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString().split('T')[0];

        await client.subscriptionsApi.createSubscription({
          idempotencyKey: Date.now().toString() + '-sub',
          locationId,
          planVariationId,
          customerId,
          startDate,
        });
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, paymentId: paymentRes.result.payment.id }),
    };

  } catch (err) {
    console.error('Square error:', err);
    const msg = err.errors
      ? err.errors.map(function(e) { return e.detail; }).join('. ')
      : err.message;
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ success: false, error: msg }),
    };
  }
};
