const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const scraper = require('./scraper');

const app = express();
const cache = new NodeCache({ stdTTL: 86400 });

// Queue system
const queue = [];
let isProcessing = false;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'AKTU Result API is running 🚀', version: '2.0.0', queue: queue.length });
});

// Main result endpoint
app.get('/api/result', async (req, res) => {
  const { roll } = req.query;

  if (!roll) {
    return res.status(400).json({ error: 'Roll number is required.' });
  }

  const rollClean = roll.trim().toUpperCase();
  const cacheKey = `${rollClean}_all`;

  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`✅ Cache HIT: ${cacheKey}`);
    return res.json({ ...cached, source: 'cache' });
  }

  // Add to queue
  const sessionId = Math.random().toString(36).substring(2, 10).toUpperCase();
  const position = queue.length + (isProcessing ? 1 : 0);

  // If queue is empty process immediately
  if (!isProcessing && queue.length === 0) {
    try {
      isProcessing = true;
      const result = await scraper.fetchResult(rollClean);
      isProcessing = false;

      if (!result) {
        return res.status(404).json({ error: 'Result not found. Please check your roll number.' });
      }

      cache.set(cacheKey, result);
      return res.json({ ...result, source: 'live' });

    } catch (err) {
      isProcessing = false;
      console.error('Error:', err.message);
      return res.status(503).json({ error: 'Result server is temporarily unavailable. Please try again.' });
    }
  }

  // Queue the request
  return new Promise((resolve) => {
    queue.push({ rollClean, cacheKey, resolve });
    processQueue();
    
    // Send queue position response
    res.json({ 
      queued: true,
      sessionId,
      position: queue.length,
      estimatedWait: queue.length * 30
    });
  });
});

// Queue status endpoint
app.get('/api/status/:sessionId', (req, res) => {
  res.json({ 
    queueLength: queue.length,
    isProcessing,
    estimatedWait: queue.length * 30
  });
});

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  
  isProcessing = true;
  const { rollClean, cacheKey, resolve } = queue.shift();

  try {
    const result = await scraper.fetchResult(rollClean);
    if (result) cache.set(cacheKey, result);
    resolve(result);
  } catch (err) {
    resolve(null);
  }

  isProcessing = false;
  processQueue();
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 AKTU Backend v2.0 running on port ${PORT}`);
  console.log(`📡 Endpoint: GET /api/result?roll=ROLLNO\n`);
});
