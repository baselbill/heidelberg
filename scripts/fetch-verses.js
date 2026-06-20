#!/usr/bin/env node
// fetch-verses.js — populate scripture text in data/catechism.json
// Usage: ESV_API_KEY=xxx node scripts/fetch-verses.js [--force]
//   --force  re-fetch all ranges even if text is already populated

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DATA_PATH = resolve(REPO_ROOT, 'data', 'catechism.json');

const ESV_API_KEY = process.env.ESV_API_KEY;
if (!ESV_API_KEY || !ESV_API_KEY.trim()) {
  process.stderr.write(
    'Error: ESV_API_KEY is not set or is empty.\n' +
    'Set it before running:\n' +
    '  ESV_API_KEY=your_key_here node scripts/fetch-verses.js\n' +
    'Get a free key at https://api.esv.org\n'
  );
  process.exit(1);
}

const FORCE = process.argv.includes('--force');

// Attribution stored with each citation for local records; not rendered in UI.
const ESV_ATTRIBUTION =
  'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), ' +
  'copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. ' +
  'Used by permission. All rights reserved.';

// Complete 66-book verse-count table for the guardrail check.
const BOOK_VERSE_COUNTS = {
  Gen: 1533, Exod: 1213, Lev: 859, Num: 1288, Deut: 959,
  Josh: 658, Judg: 618, Ruth: 85, '1 Sam': 810, '2 Sam': 695,
  '1 Kgs': 816, '2 Kgs': 719, '1 Chr': 942, '2 Chr': 822,
  Ezra: 280, Neh: 406, Esth: 167, Job: 1070, Ps: 2461,
  Prov: 915, Eccl: 222, Song: 117, Isa: 1292, Jer: 1364,
  Lam: 154, Ezek: 1273, Dan: 357, Hos: 197, Joel: 73,
  Amos: 146, Obad: 21, Jonah: 48, Mic: 105, Nah: 47,
  Hab: 56, Zeph: 53, Hag: 38, Zech: 211, Mal: 55,
  Matt: 1071, Mark: 678, Luke: 1151, John: 879, Acts: 1007,
  Rom: 433, '1 Cor': 437, '2 Cor': 257, Gal: 149, Eph: 155,
  Phil: 104, Col: 95, '1 Thess': 89, '2 Thess': 47,
  '1 Tim': 113, '2 Tim': 83, Titus: 46, Phlm: 25,
  Heb: 303, Jas: 108, '1 Pet': 105, '2 Pet': 61,
  '1 John': 105, '2 John': 13, '3 John': 14, Jude: 25, Rev: 404,
};

// Parse a displayRange string and return { book, verseCount }.
// Handles: "Book ch:v", "Book ch:v-v2" (same chapter), "Book ch:v-ch2:v2" (cross-chapter).
// All Lord's Day 15 ranges are same-chapter, giving exact counts.
function parseVerseRange(displayRange) {
  // Matches "1 John 2:1-2", "Isa 53:3-6", "Gal 3:13", "Luke 23:13-4:1" etc.
  const re = /^(\d\s[A-Za-z]+|[A-Za-z]+)\s(\d+):(\d+)(?:-(\d+):(\d+)|-(\ d+))?$/;
  // Use a simpler split-based parser for robustness.
  const trimmed = displayRange.trim();

  // Extract book: everything before the last " \d+:" sequence
  const chapterStart = trimmed.search(/\s\d+:/);
  if (chapterStart === -1) return { book: null, verseCount: 1 };
  const book = trimmed.slice(0, chapterStart).trim();
  const rest = trimmed.slice(chapterStart + 1); // "ch:v" or "ch:v-v2" or "ch:v-ch2:v2"

  // rest examples: "53:3-6", "3:13", "23:13-16", "2:1-2"
  const dashIdx = rest.indexOf('-');
  if (dashIdx === -1) {
    // Single verse: "ch:v"
    return { book, verseCount: 1 };
  }

  const startPart = rest.slice(0, dashIdx);   // "53:3"
  const endPart   = rest.slice(dashIdx + 1);  // "6" or "24:1"

  const startVerse = parseInt(startPart.split(':')[1], 10);

  if (endPart.includes(':')) {
    // Cross-chapter: "ch2:v2" — use a conservative estimate
    const endVerse = parseInt(endPart.split(':')[1], 10);
    const startChapter = parseInt(startPart.split(':')[0], 10);
    const endChapter   = parseInt(endPart.split(':')[0], 10);
    // Rough: assume ~26 verses per chapter for the bridging chapters
    const verseCount = (endChapter - startChapter) * 26 + (endVerse - startVerse + 1);
    return { book, verseCount: Math.max(verseCount, 1) };
  } else {
    // Same-chapter: endPart is just an end verse number
    const endVerse = parseInt(endPart, 10);
    return { book, verseCount: endVerse - startVerse + 1 };
  }
}

async function fetchPassage(displayRange) {
  const params = new URLSearchParams({
    q: displayRange,
    'include-passage-references': 'false',
    'include-verse-numbers': 'false',
    'include-first-verse-numbers': 'false',
    'include-footnotes': 'false',
    'include-footnote-body': 'false',
    'include-headings': 'false',
    'include-short-copyright': 'false',
    'include-copyright': 'false',
    'line-length': '0',
  });
  const url = `https://api.esv.org/v3/passage/text/?${params}`;
  const response = await fetch(url, {
    headers: { Authorization: `Token ${ESV_API_KEY}` },
  });

  if (!response.ok) {
    // Collect all response headers for egress/proxy deny-reason detection.
    const headers = {};
    for (const [k, v] of response.headers.entries()) headers[k] = v;

    // Read the body — could be JSON error, HTML proxy page, or plain text.
    const body = await response.text().catch(() => '(could not read body)');

    // Emit the full diagnostic to stderr.
    process.stderr.write(
      `\n--- ESV API failure for "${displayRange}" ---\n` +
      `HTTP status: ${response.status} ${response.statusText}\n` +
      `Headers: ${JSON.stringify(headers, null, 2)}\n` +
      `Body:\n${body}\n` +
      `--- end ---\n\n`
    );

    throw new Error(`ESV API returned ${response.status} for "${displayRange}" (see diagnostics above)`);
  }

  const data = await response.json();
  const text = ((data.passages && data.passages[0]) || '').trim();
  if (!text) {
    console.warn(`  Warning: empty passage returned for "${displayRange}"`);
  }
  return text;
}

async function main() {
  console.log(`Reading data/catechism.json …${FORCE ? ' (--force: will re-fetch all)' : ''}\n`);
  const catechism = JSON.parse(readFileSync(DATA_PATH, 'utf8'));

  // Collect all citations keyed by displayRange.
  // The map preserves insertion order, so Q37 citations are registered first —
  // this is what powers the dedup "first seen" note in the UI.
  const rangeMap = new Map(); // displayRange -> [citation objects]
  for (const record of catechism) {
    for (const group of record.proofGroups) {
      for (const citation of group.citations) {
        const key = citation.displayRange;
        if (!rangeMap.has(key)) rangeMap.set(key, []);
        rangeMap.get(key).push(citation);
      }
    }
  }

  const uniqueRanges = [...rangeMap.keys()];

  // --- Verse-count guardrail (runs over ALL unique ranges, not just unfetched ones) ---
  const bookFetched = new Map(); // book -> verse count
  for (const range of uniqueRanges) {
    const { book, verseCount } = parseVerseRange(range);
    if (book) bookFetched.set(book, (bookFetched.get(book) || 0) + verseCount);
  }

  let totalVerses = 0;
  const guardrailRows = [];
  let guardrailFailed = false;

  for (const [book, count] of [...bookFetched.entries()].sort()) {
    totalVerses += count;
    const bookTotal = BOOK_VERSE_COUNTS[book] || 0;
    const pct = bookTotal ? ((count / bookTotal) * 100).toFixed(1) : 'N/A';
    const status = bookTotal && count / bookTotal >= 0.49 ? 'FAIL >' : 'ok';
    if (status.startsWith('FAIL')) guardrailFailed = true;
    guardrailRows.push({ book, count, pct, status });
  }

  // Print the table before fetching so a guardrail failure blocks the run early.
  console.log('--- Verse-count check (all unique ranges in JSON) ---');
  console.log('Book          | Verses | % of book | Status');
  console.log('------------- | ------ | --------- | ------');
  for (const r of guardrailRows) {
    console.log(
      `${r.book.padEnd(13)} | ${String(r.count).padEnd(6)} | ${String(r.pct + '%').padEnd(9)} | ${r.status}`
    );
  }
  console.log(`\nTotal distinct verses in JSON: ${totalVerses}`);

  if (guardrailFailed) {
    console.error('\nError: one or more books exceed the 49%-of-book limit. Aborting.');
    process.exit(1);
  }
  if (totalVerses >= 490) {
    console.error(`\nError: ${totalVerses} verses in JSON — approaching the 500-verse limit. Aborting.`);
    process.exit(1);
  }
  console.log('Guardrail: OK\n');

  // --- Fetch ---
  const toFetch = FORCE
    ? uniqueRanges
    : uniqueRanges.filter(r => rangeMap.get(r).some(c => !c.text));

  if (toFetch.length === 0) {
    console.log('All passages already populated. Run with --force to re-fetch.\n');
  } else {
    console.log(`Fetching ${toFetch.length} of ${uniqueRanges.length} unique ranges …\n`);
    let fetchFailed = false;
    for (const range of toFetch) {
      process.stdout.write(`  Fetching "${range}" … `);
      try {
        const text = await fetchPassage(range);
        for (const citation of rangeMap.get(range)) {
          citation.text = text;
          citation.copyright = ESV_ATTRIBUTION;
        }
        console.log('done');
      } catch (err) {
        console.log(`FAILED: ${err.message}`);
        fetchFailed = true;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (fetchFailed) {
      process.stderr.write('\nOne or more fetches failed. catechism.json was NOT updated.\n');
      process.exit(1);
    }
  }

  console.log('\nWriting updated data/catechism.json …');
  writeFileSync(DATA_PATH, JSON.stringify(catechism, null, 2) + '\n', 'utf8');
  console.log('Done.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
