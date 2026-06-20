#!/usr/bin/env node
// fetch-verses.js — populate scripture text in data/catechism.json
// Usage: ESV_API_KEY=xxx node scripts/fetch-verses.js

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DATA_PATH = resolve(REPO_ROOT, 'data', 'catechism.json');

const ESV_API_KEY = process.env.ESV_API_KEY;
if (!ESV_API_KEY) {
  console.error('Error: ESV_API_KEY environment variable is not set.');
  console.error('Get a free key at https://api.esv.org and then run:');
  console.error('  ESV_API_KEY=your_key_here node scripts/fetch-verses.js');
  process.exit(1);
}

// Simple verse-count table (approximate, enough for 49% guard)
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

function extractBookAbbr(reference) {
  // Match things like "Matt", "1 Cor", "Isa", "Deut"
  const match = reference.match(/^(\d\s)?[A-Za-z]+/);
  return match ? match[0].trim() : null;
}

function parseVerseRange(displayRange) {
  // Returns { book, verseCount } — rough count of verses in range
  // Format: "Book ch:v-v" or "Book ch:v-ch:v"
  const bookMatch = displayRange.match(/^(\d\s[A-Za-z]+|[A-Za-z]+)\s(\d+):(\d+)(?:-(\d+):?(\d+)?)?$/);
  if (!bookMatch) return { book: null, verseCount: 1 };
  const [, book, startCh, startV, endChOrV, endV] = bookMatch;
  let verseCount = 1;
  if (endV !== undefined) {
    // cross-chapter: rough estimate
    verseCount = parseInt(endV) - parseInt(startV) + 5;
  } else if (endChOrV !== undefined) {
    verseCount = parseInt(endChOrV) - parseInt(startV) + 1;
  }
  return { book: book.trim(), verseCount: Math.max(verseCount, 1) };
}

async function fetchPassage(displayRange) {
  const url = `https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(displayRange)}&include-passage-references=false&include-verse-numbers=false&include-first-verse-numbers=false&include-footnotes=false&include-footnote-body=false&include-headings=false&include-short-copyright=false&include-copyright=true&line-length=0`;
  const response = await fetch(url, {
    headers: { Authorization: `Token ${ESV_API_KEY}` },
  });
  if (!response.ok) {
    throw new Error(`ESV API returned ${response.status} for "${displayRange}"`);
  }
  const data = await response.json();
  const raw = (data.passages && data.passages[0]) || '';
  if (!raw) {
    console.warn(`  Warning: empty passage returned for "${displayRange}"`);
    return { text: '', copyright: '' };
  }

  // Copyright statement begins with "Scripture quotations"
  const copyrightMarker = 'Scripture quotations';
  const idx = raw.indexOf(copyrightMarker);
  let text, copyright;
  if (idx !== -1) {
    text = raw.slice(0, idx).trim();
    copyright = raw.slice(idx).trim();
  } else {
    text = raw.trim();
    copyright = '';
  }
  return { text, copyright };
}

async function main() {
  console.log('Reading data/catechism.json …');
  const catechism = JSON.parse(readFileSync(DATA_PATH, 'utf8'));

  // Collect all citations keyed by displayRange
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
  const toFetch = uniqueRanges.filter(r => rangeMap.get(r).some(c => c.text === ''));

  console.log(`Found ${uniqueRanges.length} unique display ranges; ${toFetch.length} need fetching.\n`);

  // Track fetched verses by book
  const bookFetched = new Map(); // book abbr -> verse count

  for (const range of toFetch) {
    process.stdout.write(`Fetching "${range}" … `);
    try {
      const { text, copyright } = await fetchPassage(range);
      // Write to all citation objects sharing this displayRange
      for (const citation of rangeMap.get(range)) {
        citation.text = text;
        citation.copyright = copyright;
      }
      const { book, verseCount } = parseVerseRange(range);
      if (book) {
        bookFetched.set(book, (bookFetched.get(book) || 0) + verseCount);
      }
      console.log('done');
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
    // Small delay to be polite to the API
    await new Promise(r => setTimeout(r, 200));
  }

  // Print summary table
  let totalFetched = 0;
  console.log('\n--- Verse fetch summary ---');
  console.log('Book          | Verses fetched | % of book');
  console.log('------------- | -------------- | ---------');
  for (const [book, count] of [...bookFetched.entries()].sort()) {
    totalFetched += count;
    const total = BOOK_VERSE_COUNTS[book] || 0;
    const pct = total ? ((count / total) * 100).toFixed(1) : 'N/A';
    console.log(`${book.padEnd(13)} | ${String(count).padEnd(14)} | ${pct}%`);

    if (total && count / total >= 0.49) {
      console.error(`\nError: Fetched ${pct}% of ${book} — exceeds 49% limit.`);
      process.exit(1);
    }
  }
  console.log(`\nTotal verses fetched across all books: ${totalFetched}`);

  if (totalFetched >= 490) {
    console.error('\nError: Total verses fetched (${totalFetched}) exceeds limit of 490.');
    process.exit(1);
  }

  console.log('\nWriting updated data/catechism.json …');
  writeFileSync(DATA_PATH, JSON.stringify(catechism, null, 2) + '\n', 'utf8');
  console.log('Done.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
