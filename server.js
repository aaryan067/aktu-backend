const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const scraper = require('./scraper');

const app = express();
const cache = new NodeCache({ stdTTL: 86400 });

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'AKTU Result API 🚀', version: '3.0.0' }));

app.get('/api/result', async (req, res) => {
  const { roll } = req.query;
  if (!roll) return res.status(400).json({ error: 'Roll number required.' });

  const rollClean = roll.trim().toUpperCase();
  const cached = cache.get(rollClean);
  if (cached) return res.json({ ...cached, source: 'cache' });

  try {
    const result = await scraper.fetchResult(rollClean);
    if (!result) return res.status(404).json({ error: 'Result not found. Check roll number.' });
    cache.set(rollClean, result);
    return res.json({ ...result, source: 'live' });
  } catch (err) {
    console.error(err.message);
    return res.status(503).json({ error: 'Result server is temporarily unavailable. Please try again.' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`\n🚀 AKTU Backend v3.0 on port ${PORT}\n`));
