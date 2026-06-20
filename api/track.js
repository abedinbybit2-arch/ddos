// ═══════════════════════════════════════════════
// FILE: api/track.js
// এই file টা তোমার GitHub repo তে /api/track.js এ রাখো
// ═══════════════════════════════════════════════

const BOT_TOKEN = "8726361470:AAErTzupAMjDRDopACMXBz0_YMuU_2h2cQg";   // ← তোমার bot token
const CHAT_ID   = "1873240895";     // ← তোমার chat id
const THRESHOLD = 20; // per second এর বেশি হলে DDoS ধরবে

// Vercel এ global variable দিয়ে request count রাখা হয়
if (!global._ddos) {
  global._ddos = {
    bucket: [],
    total: 0,
    ipMap: {},
    isAttack: false,
    lastSummary: 0,
  };
}
const store = global._ddos;

async function sendTelegram(text) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  } catch(e) {}
}

function ts() {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka' });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Real IP
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    'unknown';

  const action = req.query.action || 'visit';
  const now = Date.now();

  // last 1 second এর request count
  store.bucket.push(now);
  store.bucket = store.bucket.filter(t => now - t < 1000);
  store.total++;
  store.ipMap[ip] = (store.ipMap[ip] || 0) + 1;

  const rps = store.bucket.length;
  const nowAttack = rps >= THRESHOLD;

  if (nowAttack && !store.isAttack) {
    // Attack শুরু
    store.isAttack = true;
    await sendTelegram(
      `🚨 *DDoS Attack শুরু!*\n` +
      `⚡ Req/sec: *${rps}*\n` +
      `🌐 IP: \`${ip}\`\n` +
      `📊 Total requests: ${store.total}\n` +
      `🕐 ${ts()}`
    );

  } else if (!nowAttack && store.isAttack) {
    // Attack শেষ
    store.isAttack = false;
    await sendTelegram(
      `✅ *Attack শেষ। Traffic স্বাভাবিক।*\n` +
      `Req/sec: ${rps}\n` +
      `🕐 ${ts()}`
    );

  } else if (nowAttack) {
    // DDoS চলছে — প্রতি সেকেন্ডে একটা summary
    if (now - store.lastSummary >= 1000) {
      store.lastSummary = now;
      const topIPs = Object.entries(store.ipMap)
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([ip, c]) => `  • \`${ip}\` — ${c} req`).join('\n');
      await sendTelegram(
        `⚠️ *DDoS চলছে*\n` +
        `⚡ Req/sec: *${rps}* | Total: ${store.total}\n` +
        `👥 Unique IPs: ${Object.keys(store.ipMap).length}\n\n` +
        `🔴 *Top IPs:*\n${topIPs}\n` +
        `🕐 ${ts()}`
      );
    }

  } else {
    // Normal request — সাথে সাথে Telegram
    await sendTelegram(
      `📩 *New Request*\n` +
      `🌐 IP: \`${ip}\`\n` +
      `🔘 Action: ${action}\n` +
      `📊 Total: ${store.total}\n` +
      `🕐 ${ts()}`
    );
  }

  res.status(200).json({ ok: true, rps, total: store.total, attack: nowAttack });
}
