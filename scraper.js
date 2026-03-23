// Updated scraper v2 - better error logging
const axios = require('axios');
const cheerio = require('cheerio');

// ─── AKTU ERP BASE URLs ───────────────────────────────────
const BASE_URL = 'https://oneview.aktu.ac.in';
const RESULT_URL = `${BASE_URL}/WebPages/OneView/Stu_SemResult.aspx`;
const RESULT_URL_2 = 'https://erp.aktu.ac.in/WebPages/OneView/Stu_SemResult.aspx';

// ─── HEADERS to mimic a real browser ─────────────────────
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

// ─── MAIN FETCH FUNCTION ──────────────────────────────────
async function fetchResult(rollNo, semester) {
  try {
    // Step 1: GET the result page to grab ASP.NET hidden fields
    const session = axios.create({
      baseURL: BASE_URL,
      headers: HEADERS,
      withCredentials: true,
      timeout: 15000,
    });

    const getResp = await session.get(RESULT_URL);
    const $ = cheerio.load(getResp.data);

    // Extract ASP.NET form fields (required for POST)
    const viewState         = $('#__VIEWSTATE').val() || '';
    const viewStateGen      = $('#__VIEWSTATEGENERATOR').val() || '';
    const eventValidation   = $('#__EVENTVALIDATION').val() || '';

    if (!viewState) {
      throw new Error('Could not load AKTU page — site may be down');
    }

    // Step 2: POST with roll number (no DOB needed here!)
    const formData = new URLSearchParams({
      '__VIEWSTATE':          viewState,
      '__VIEWSTATEGENERATOR': viewStateGen,
      '__EVENTVALIDATION':    eventValidation,
      'ctl00$ContentPlaceHolder1$txtRollNo': rollNo,
      'ctl00$ContentPlaceHolder1$ddlSemester': semester,
      'ctl00$ContentPlaceHolder1$btnSubmit':  'View Result',
    });

    const postURL = getResp.config ? getResp.config.url : RESULT_URL;
    const postResp = await session.post(postURL, formData.toString(), {
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': RESULT_URL,
      },
    });

    // Step 3: Parse the result HTML
    return parseResult(postResp.data, rollNo, semester);

  } catch (err) {
    console.error('fetchResult error:', err.message);
    throw err;
  }
}

// ─── PARSE HTML RESULT ────────────────────────────────────
function parseResult(html, rollNo, semester) {
  const $ = cheerio.load(html);

  // Check if result exists
  const errorMsg = $('#ctl00_ContentPlaceHolder1_lblMessage').text().trim();
  if (errorMsg && errorMsg.toLowerCase().includes('not found')) {
    return null;
  }

  // ── Student Info ──
  const name    = clean($('#ctl00_ContentPlaceHolder1_lblStudentName').text());
  const course  = clean($('#ctl00_ContentPlaceHolder1_lblCourseName').text());
  const college = clean($('#ctl00_ContentPlaceHolder1_lblInstituteName').text());
  const sgpa    = clean($('#ctl00_ContentPlaceHolder1_lblSGPA').text()) || '—';
  const cgpa    = clean($('#ctl00_ContentPlaceHolder1_lblCGPA').text()) || '—';
  const status  = clean($('#ctl00_ContentPlaceHolder1_lblResult').text()) || 'UNKNOWN';

  if (!name) return null; // No student data found

  // ── Subject-wise Marks ──
  const subjects = [];
  $('#ctl00_ContentPlaceHolder1_GridView1 tr').each((i, row) => {
    if (i === 0) return; // skip header row
    const cells = $(row).find('td');
    if (cells.length >= 4) {
      subjects.push({
        name:  clean($(cells[1]).text()),
        code:  clean($(cells[0]).text()),
        marks: clean($(cells[2]).text()),
        grade: clean($(cells[3]).text()),
      });
    }
  });

  return {
    name,
    rollNo,
    course,
    college,
    semester: `Semester ${semester}`,
    sgpa,
    cgpa,
    status: status.toUpperCase().includes('PASS') ? 'PASS' : 'FAIL',
    subjects,
    fetchedAt: new Date().toISOString(),
  };
}

// ─── HELPER ───────────────────────────────────────────────
function clean(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

module.exports = { fetchResult };
