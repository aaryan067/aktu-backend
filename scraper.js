const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
  'Connection': 'keep-alive',
  'Referer': 'https://erp.aktu.ac.in/',
};

const URLS = [
  'https://erp.aktu.ac.in/WebPages/OneView/Stu_SemResult.aspx',
  'https://erp.aktu.ac.in/WebPages/Result/ResultNew.aspx',
];

async function fetchResult(rollNo) {
  console.log(`\n🔍 Fetching: ${rollNo}`);
  for (const url of URLS) {
    try {
      const session = axios.create({ timeout: 20000, maxRedirects: 10, headers: HEADERS });
      const cookies = {};
      session.interceptors.response.use(res => {
        (res.headers['set-cookie']||[]).forEach(c => {
          const [kv] = c.split(';');
          const [k,v] = kv.split('=');
          if (k&&v) cookies[k.trim()]=v.trim();
        });
        return res;
      });
      session.interceptors.request.use(config => {
        const cs = Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ');
        if (cs) config.headers['Cookie'] = cs;
        return config;
      });

      console.log(`📡 GET: ${url}`);
      const getResp = await session.get(url);
      const $ = cheerio.load(getResp.data);
      const viewState = $('#__VIEWSTATE').val();
      if (!viewState) { console.log('No ViewState'); continue; }

      const formData = new URLSearchParams({
        '__VIEWSTATE': viewState,
        '__VIEWSTATEGENERATOR': $('#__VIEWSTATEGENERATOR').val()||'',
        '__EVENTVALIDATION': $('#__EVENTVALIDATION').val()||'',
        'ctl00$ContentPlaceHolder1$txtRollNo': rollNo,
        'ctl00$ContentPlaceHolder1$btnSubmit': 'View Result',
      });

      const postResp = await session.post(url, formData.toString(), {
        headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': url }
      });

      const result = parseResult(postResp.data, rollNo);
      if (result) { console.log('✅ Got result!'); return result; }

    } catch(e) { console.log(`❌ ${url}: ${e.message}`); }
  }
  throw new Error('AKTU server unavailable');
}

function parseResult(html, rollNo) {
  const $ = cheerio.load(html);
  const data = {};
  $('table tr').each((i,row) => {
    const cells = $(row).find('td');
    for (let j=0; j<cells.length-1; j++) {
      const label = $(cells[j]).text().trim();
      const value = $(cells[j+1]).text().trim();
      if (label && value && label.length < 50) data[label] = value;
    }
  });
  const name = data['Name']||data['Student Name']||'';
  if (!name) return null;
  const sessions = [];
  $('table').each((i,table) => {
    if ($(table).text().includes('Session')) {
      $(table).find('tr').each((j,row) => {
        if (j===0) return;
        const cells = $(row).find('td');
        const session = $(cells[0]).text().trim();
        if (session && session.match(/\d{4}/)) {
          sessions.push({
            session, semesters: $(cells[1]).text().trim(),
            result: $(cells[2]).text().trim(),
            marks: $(cells[3])?.text().trim()||'',
            aucStatus: $(cells[4])?.text().trim()||''
          });
        }
      });
    }
  });
  return {
    name, rollNo,
    enrollNo: data['EnrollmentNo']||'—',
    course: data['Course Code & Name']||'—',
    college: data['Institute Code & Name']||'—',
    branch: data['Branch Code & Name']||'—',
    fatherName: data["Father's Name"]||'—',
    gender: data['Gender']||'—',
    hindiName: data['Hindi Name']||'—',
    status: sessions.some(s=>s.result?.includes('PASS'))?'PASS':'UNKNOWN',
    subjects: sessions,
    fetchedAt: new Date().toISOString()
  };
}

module.exports = { fetchResult };
