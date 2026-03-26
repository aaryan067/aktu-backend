const puppeteer = require('puppeteer');

const SEED_ROLL = '1305650004';
const AKTU_URL = 'https://oneview.aktu.ac.in';

async function fetchResult(rollNo) {
  let browser;
  try {
    console.log('🚀 Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 720 });

    // Step 1: Open AKTU site
    console.log('📡 Opening AKTU site...');
    await page.goto(AKTU_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('✅ Page loaded:', await page.title());

    // Step 2: Enter seed roll to create session
    console.log('🔑 Entering seed roll number...');
    await page.waitForSelector('input[type="text"]', { timeout: 10000 });
    await page.click('input[type="text"]');
    await page.type('input[type="text"]', SEED_ROLL);
    
    // Click submit
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
      page.click('input[type="submit"], button[type="submit"], button')
    ]);
    console.log('✅ Seed result loaded');

    // Step 3: Go back
    console.log('⬅️ Going back...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
      page.goBack()
    ]);

    // Step 4: Enter actual roll number
    console.log('📝 Entering actual roll number:', rollNo);
    await page.waitForSelector('input[type="text"]', { timeout: 10000 });
    await page.click('input[type="text"]', { clickCount: 3 });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.type('input[type="text"]', rollNo);

    // Submit
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
      page.click('input[type="submit"], button[type="submit"], button')
    ]);
    console.log('✅ Result page loaded');

    // Step 5: Scrape result
    const result = await page.evaluate(() => {
      const data = {};
      
      // Parse all table cells
      document.querySelectorAll('table tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        for (let i = 0; i < cells.length - 1; i++) {
          const label = cells[i].textContent.trim();
          const value = cells[i+1].textContent.trim();
          if (label && value && label.length < 40) {
            data[label] = value;
          }
        }
      });

      // Parse sessions
      const sessions = [];
      document.querySelectorAll('table').forEach(table => {
        const text = table.textContent;
        if (text.includes('Session') && text.includes('Result')) {
          table.querySelectorAll('tr').forEach((row, i) => {
            if (i === 0) return;
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
              const session = cells[0]?.textContent.trim();
              if (session && session.includes('-')) {
                sessions.push({
                  session: session,
                  semesters: cells[1]?.textContent.trim() || '',
                  result: cells[2]?.textContent.trim() || '',
                  marks: cells[3]?.textContent.trim() || '',
                  aucStatus: cells[4]?.textContent.trim() || ''
                });
              }
            }
          });
        }
      });

      return { data, sessions, title: document.title };
    });

    console.log('📊 Data scraped:', JSON.stringify(result.data).substring(0, 200));

    if (!result.data['Name'] && !result.data['RollNo']) {
      return null;
    }

    return {
      name: result.data['Name'] || '—',
      rollNo: result.data['RollNo'] || rollNo,
      enrollNo: result.data['EnrollmentNo'] || '—',
      course: result.data['Course Code & Name'] || '—',
      college: result.data['Institute Code & Name'] || '—',
      branch: result.data['Branch Code & Name'] || '—',
      fatherName: result.data["Father's Name"] || '—',
      gender: result.data['Gender'] || '—',
      hindiName: result.data['Hindi Name'] || '—',
      semester: 'All Semesters',
      sgpa: '—',
      cgpa: '—',
      status: result.sessions.some(s => s.result?.includes('PASS')) ? 'PASS' : 'UNKNOWN',
      subjects: result.sessions,
      fetchedAt: new Date().toISOString()
    };

  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed');
    }
  }
}

module.exports = { fetchResult };
