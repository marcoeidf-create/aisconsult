const RESIDENTIAL_KEYWORDS = [
  'comcast', 'verizon', 'at&t', 'att', 'claro', 'tim ', ' tim,', 'oi ', ' oi,',
  'spectrum', 'cox ', 'charter', 'frontier', 'centurylink', 'lumen',
  'residential', 'broadband', 'cable', 'dsl', 'fiber',
];

function isResidential(org = '') {
  const lower = org.toLowerCase();
  return RESIDENTIAL_KEYWORDS.some((kw) => lower.includes(kw));
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  if (req.method !== 'POST') {
    res.writeHead(405, CORS_HEADERS);
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const forwarded = req.headers['x-forwarded-for'] || '';
    const ip = forwarded.split(',')[0].trim() || req.socket?.remoteAddress || '';

    let body = {};
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    } catch (_) {}

    const { page = '', referrer = '' } = body;

    const ipinfoRes = await fetch(
      `https://ipinfo.io/${ip}/json?token=${process.env.IPINFO_TOKEN}`
    );
    const info = await ipinfoRes.json();
    console.log('IPinfo response:', JSON.stringify(info));

    const { ip: resolvedIp = ip, org = '', city = '', region = '', country = '' } = info;
    const company = org.replace(/^AS\d+\s*/, '').trim();

    if (isResidential(org)) {
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ skipped: true, reason: 'residential' }));
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    await fetch(`${supabaseUrl}/rest/v1/visitor_leads`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ company, org, ip: resolvedIp, city, region, country, page, referrer }),
    });

    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `*New visitor*\n*Company:* ${company || 'Unknown'}\n*Page:* ${page}\n*Location:* ${city}, ${country}`,
      }),
    });

    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}
