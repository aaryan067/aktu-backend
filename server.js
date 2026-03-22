const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const scraper = require('./scraper');

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
  const { roll, sem } = req.query;

  if (!roll || !sem) {
    return res.status(400).json({ error: 'Roll number and semester are required.' });
  }

  const rollClean = roll.trim().toUpperCase();
  const cacheKey = `${rollClean}_sem${sem}`;

  // ── Check cache first ──
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`✅ Cache HIT: ${cacheKey}`);
    return res.json({ ...cached, source: 'cache' });
  }

  // ── Scrape from AKTU ──
  console.log(`🔍 Scraping AKTU for: ${cacheKey}`);
  try {
    const result = await scraper.fetchResult(rollClean, sem);
    if (!result) {
      return res.status(404).json({ error: 'Result not found. Check roll number or semester.' });
    }
    cache.set(cacheKey, result);
    console.log(`💾 Cached: ${cacheKey}`);
    return res.json({ ...result, source: 'live' });
  } catch (err) {
    console.error('Scrape error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch result. AKTU server may be down. Try again later.' });
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
