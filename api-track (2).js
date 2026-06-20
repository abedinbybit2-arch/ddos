// FILE: api/track.js
// GitHub repo তে /api/track.js এ রাখো

const BOT_TOKEN = "YOUR_BOT_TOKEN_HERE";
const CHAT_ID   = "YOUR_CHAT_ID_HERE";
const THRESHOLD = 20; // per second এর বেশি = DDoS

if (!global._s) {
  global._s = {
    bucket: [],
    total: 0,
    ipMap: {},
    isAttack: false,
    lastSummary: 0,
  };
}
const s = global._s;

// Fire-and-forget — await করবো না, response block হবে না
function sendTelegram(text) {
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
  }).catch(() => {});
}

function ts() {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka' });
}

export default function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // IP
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    'unknown';

  const action = req.query.action || 'visit';
  const now = Date.now();

  // Count
  s.bucket.push(now);
  s.bucket = s.bucket.filter(t => now - t < 1000);
  s.total++;
  s.ipMap[ip] = (s.ipMap[ip] || 0) + 1;

  const rps = s.bucket.length;
  const nowAttack = rps >= THRESHOLD;

  // ─── Telegram logic ───
  if (nowAttack && !s.isAttack) {
    s.isAttack = true;
    sendTelegram(
      `🚨 *DDoS Attack শুরু!*\n` +
      `⚡ Req/sec: *${rps}*\n` +
      `🌐 IP: \`${ip}\`\n` +
      `📊 Total: ${s.total}\n` +
      `🕐 ${ts()}`
    );

  } else if (!nowAttack && s.isAttack) {
    s.isAttack = false;
    sendTelegram(
      `✅ *Attack শেষ!*\nTraffic স্বাভাবিক\nReq/sec: ${rps}\n🕐 ${ts()}`
    );

  } else if (nowAttack) {
    // DDoS চলছে — প্রতি সেকেন্ডে একটা summary, বেশি না
    if (now - s.lastSummary >= 1000) {
      s.lastSummary = now;
      const topIPs = Object.entries(s.ipMap)
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([ip, c]) => `  • \`${ip}\` — ${c} req`).join('\n');
      sendTelegram(
        `⚠️ *DDoS চলছে*\n` +
        `⚡ Req/sec: *${rps}* | Total: ${s.total}\n` +
        `👥 Unique IPs: ${Object.keys(s.ipMap).length}\n\n` +
        `🔴 *Top IPs:*\n${topIPs}\n` +
        `🕐 ${ts()}`
      );
    }

  } else {
    // Normal request
    sendTelegram(
      `📩 *New Request*\n` +
      `🌐 IP: \`${ip}\`\n` +
      `🔘 Action: ${action}\n` +
      `📊 Total: ${s.total}\n` +
      `🕐 ${ts()}`
    );
  }

  // সাথে সাথে response দিয়ে দাও — Telegram এর জন্য wait করবো না
  return res.status(200).json({ ok: true, rps, total: s.total, attack: nowAttack });
}
