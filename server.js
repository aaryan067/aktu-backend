const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const scraper = require('./scraper');

const RECAPTCHA_SECRET = '6Lf9NJMsAAAAAHyG0pHv6s2s9vnLoT7z39yz4-wi';

async function verifyCaptcha(token) {
  try {
    const res = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET}&response=${token}`
    );
    return res.data.success;
  } catch (err) {
    return false;
  }
}

const app = express();
const cache = new NodeCache({ stdTTL: 86400 }); // cache for 24 hours

app.use(cors());
app.use(express.json());

// ─── HEALTH CHECK ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'AKTU Result API is running 🚀', version: '1.0.0' });
});

// ─── MAIN RESULT ENDPOINT ─────────────────────────────────
// GET /api/result?roll=2100140520001&sem=3
app.get('/api/result', async (req, res) => {
  const { roll } = req.query;

  if (!roll) {
    return res.status(400).json({ error: 'Roll number is required.' });
  }

  // Verify reCAPTCHA (optional - skip if not provided for testing)
  const captcha = req.query.captcha;
  if (captcha) {
    const isHuman = await verifyCaptcha(captcha);
    if (!isHuman) {
      return res.status(403).json({ error: 'CAPTCHA verification failed. Please try again.' });
    }
  }

  const rollClean = roll.trim().toUpperCase();
  const cacheKey = `${rollClean}_all`;

  // ── Check cache first ──
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`✅ Cache HIT: ${cacheKey}`);
    return res.json({ ...cached, source: 'cache' });
  }

  // ── Scrape from AKTU ──
  console.log(`🔍 Scraping AKTU for: ${cacheKey}`);
  try {
    const result = await scraper.fetchResult(rollClean);
    if (!result) {
      return res.status(404).json({ error: 'Result not found. Check roll number or semester.' });
    }
    cache.set(cacheKey, result);
    console.log(`💾 Cached: ${cacheKey}`);
    return res.json({ ...result, source: 'live' });
  } catch (err) {
    console.error('Scrape error:', err.message);
    if (err.message.includes('unreachable') || err.message.includes('down') || err.message.includes('ECONNREFUSED') || err.message.includes('timeout')) {
      return res.status(503).json({ error: 'AKTU server is currently down. Please try again after some time.' });
    }
    return res.status(500).json({ error: 'Failed to fetch result. Please try again.' });
  }
});

// ─── CLEAR CACHE (admin use) ───────────────────────────────
app.delete('/api/cache/:key', (req, res) => {
  cache.del(req.params.key);
  res.json({ message: 'Cache cleared for: ' + req.params.key });
});

// ─── START SERVER ─────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 AKTU Backend running on http://localhost:${PORT}`);
  console.log(`📡 Endpoint: GET /api/result?roll=ROLLNO&sem=SEM\n`);
});
