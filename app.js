// app.js — Heidelberg Catechism Study App
// ES6 module, no dependencies, no bundler

const LEADER_MODE_KEY = 'hc-leader-mode';

// Per-question UI state
const cardState = {};

function getCardState(qNumber) {
  if (!cardState[qNumber]) {
    cardState[qNumber] = { versesShown: false, answerShown: false, groupsShown: {}, suppShown: {} };
  }
  return cardState[qNumber];
}

// ---------- Leader mode ----------

function isLeaderMode() {
  return localStorage.getItem(LEADER_MODE_KEY) === 'true';
}

function setLeaderMode(on) {
  localStorage.setItem(LEADER_MODE_KEY, on ? 'true' : 'false');
  const btn = document.getElementById('leader-toggle');
  if (btn) btn.setAttribute('aria-pressed', String(on));
  renderLeaderBanner(on);
}

function renderLeaderBanner(on) {
  let banner = document.getElementById('leader-banner');
  if (on) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'leader-banner';
      banner.className = 'leader-banner';
      banner.textContent = 'Leader mode active — all answers and verses are visible';
      document.body.insertBefore(banner, document.querySelector('header').nextSibling);
    }
  } else {
    if (banner) banner.remove();
  }
}

// ---------- Routing ----------

let catechismData = [];

async function init() {
  catechismData = await fetch('data/catechism.json').then(r => r.json());

  const btn = document.getElementById('leader-toggle');
  btn.setAttribute('aria-pressed', String(isLeaderMode()));
  btn.addEventListener('click', () => {
    setLeaderMode(!isLeaderMode());
    route();
  });

  renderLeaderBanner(isLeaderMode());
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const hash = location.hash;
  if (!hash || hash === '#') {
    renderLanding();
  } else {
    const m = hash.match(/^#ld-(\d+)$/);
    if (m) renderLordsDay(parseInt(m[1], 10));
    else renderLanding();
  }
}

// ---------- Landing ----------

function renderLanding() {
  const app = document.getElementById('app');

  const days = new Map();
  for (const record of catechismData) {
    if (!days.has(record.lordsDay)) days.set(record.lordsDay, []);
    days.get(record.lordsDay).push(record);
  }

  const heading = document.createElement('h1');
  heading.textContent = 'Heidelberg Catechism';

  const ul = document.createElement('ul');
  ul.className = 'lords-day-list';

  for (const [ld, records] of days.entries()) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#ld-${ld}`;
    a.className = 'lords-day-card';

    const title = document.createElement('strong');
    title.textContent = `Lord's Day ${ld}`;

    const sub = document.createElement('span');
    sub.className = 'lords-day-sub';
    sub.textContent = ` — Q&A ${records.map(r => r.qNumber).join(', ')}`;

    a.appendChild(title);
    a.appendChild(sub);
    li.appendChild(a);
    ul.appendChild(li);
  }

  app.innerHTML = '';
  app.appendChild(heading);
  app.appendChild(ul);
}

// ---------- Lord's Day view ----------

function renderLordsDay(n) {
  const records = catechismData.filter(r => r.lordsDay === n);
  const app = document.getElementById('app');
  app.innerHTML = '';

  const back = document.createElement('p');
  back.className = 'back-link';
  const backA = document.createElement('a');
  backA.href = '#';
  backA.textContent = '← All Lord\'s Days';
  back.appendChild(backA);
  app.appendChild(back);

  const heading = document.createElement('h1');
  heading.textContent = `Lord's Day ${n}`;
  app.appendChild(heading);

  // Build a map of displayRange -> first qNumber in this Lord's Day (in record order).
  // Used to annotate repeated windows with "(also read under Q{n})".
  const firstSeen = new Map();
  for (const record of records) {
    for (const group of record.proofGroups) {
      for (const citation of group.citations) {
        if (!firstSeen.has(citation.displayRange)) {
          firstSeen.set(citation.displayRange, record.qNumber);
        }
      }
    }
  }

  for (const record of records) {
    app.appendChild(buildQuestionCard(record, firstSeen));
  }

  const dq = buildDiscussionQuestions(n);
  if (dq) app.appendChild(dq);
}

// ---------- Question card ----------

function buildQuestionCard(record, firstSeen) {
  const leader = isLeaderMode();
  const state = getCardState(record.qNumber);

  const article = document.createElement('article');
  article.className = 'qa-card';
  article.dataset.q = record.qNumber;

  const qNum = document.createElement('h2');
  qNum.className = 'question-number';
  qNum.textContent = `Question ${record.qNumber}`;
  article.appendChild(qNum);

  const qText = document.createElement('p');
  qText.className = 'question-text';
  qText.textContent = record.question;
  article.appendChild(qText);

  // --- Verses section ---
  const versesSection = document.createElement('div');
  versesSection.className = 'verses-section';
  if (!leader && !state.versesShown) versesSection.hidden = true;

  for (let i = 0; i < record.proofGroups.length; i++) {
    const group = record.proofGroups[i];
    const groupDiv = document.createElement('div');
    groupDiv.className = 'proof-group';
    groupDiv.dataset.groupIndex = i;

    const groupOpen = leader || !!state.groupsShown[i];

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'group-toggle';
    toggleBtn.textContent = `${group.label} ${groupOpen ? '▾' : '▸'}`;
    toggleBtn.setAttribute('aria-expanded', String(groupOpen));

    const groupContent = document.createElement('div');
    groupContent.className = 'group-content';
    if (!groupOpen) groupContent.hidden = true;

    // Split citations by tier
    const primary = group.citations.filter(c => (c.tier || 'primary') === 'primary');
    const supplemental = group.citations.filter(c => c.tier === 'supplemental');

    for (const citation of primary) {
      groupContent.appendChild(buildCitation(citation, record.qNumber, firstSeen));
    }

    // "More passages" sub-toggle for supplemental citations
    if (supplemental.length > 0) {
      const suppOpen = leader || !!state.suppShown[i];

      const suppGroup = document.createElement('div');
      suppGroup.className = 'supplemental-group';

      const suppToggle = document.createElement('button');
      suppToggle.className = 'more-passages-toggle';
      suppToggle.textContent = suppOpen
        ? `▾ Fewer passages`
        : `▸ More passages (${supplemental.length})`;
      suppToggle.setAttribute('aria-expanded', String(suppOpen));

      const suppContent = document.createElement('div');
      suppContent.className = 'supplemental-content';
      if (!suppOpen) suppContent.hidden = true;

      for (const citation of supplemental) {
        suppContent.appendChild(buildCitation(citation, record.qNumber, firstSeen));
      }

      suppToggle.addEventListener('click', () => {
        const nowOpen = suppContent.hidden;
        suppContent.hidden = !nowOpen;
        suppToggle.textContent = nowOpen ? '▾ Fewer passages' : `▸ More passages (${supplemental.length})`;
        suppToggle.setAttribute('aria-expanded', String(nowOpen));
        getCardState(record.qNumber).suppShown[i] = nowOpen;
      });

      suppGroup.appendChild(suppToggle);
      suppGroup.appendChild(suppContent);
      groupContent.appendChild(suppGroup);
    }

    toggleBtn.addEventListener('click', () => {
      const nowOpen = groupContent.hidden;
      groupContent.hidden = !nowOpen;
      toggleBtn.textContent = `${group.label} ${nowOpen ? '▾' : '▸'}`;
      toggleBtn.setAttribute('aria-expanded', String(nowOpen));
      getCardState(record.qNumber).groupsShown[i] = nowOpen;
    });

    groupDiv.appendChild(toggleBtn);
    groupDiv.appendChild(groupContent);
    versesSection.appendChild(groupDiv);
  }

  article.appendChild(versesSection);

  // Show verses button
  const showVersesBtn = document.createElement('button');
  showVersesBtn.className = 'show-verses-btn';
  showVersesBtn.textContent = 'Show verses';
  if (leader || state.versesShown) showVersesBtn.hidden = true;

  showVersesBtn.addEventListener('click', () => {
    versesSection.hidden = false;
    showVersesBtn.hidden = true;
    revealAnswerBtn.hidden = false;
    getCardState(record.qNumber).versesShown = true;
  });

  article.appendChild(showVersesBtn);

  // --- Answer section ---
  const answerSection = document.createElement('div');
  answerSection.className = 'answer-section';
  if (!leader && !state.answerShown) answerSection.hidden = true;

  const answerLabel = document.createElement('h3');
  answerLabel.className = 'answer-label';
  answerLabel.textContent = 'Answer';

  const answerText = document.createElement('p');
  answerText.className = 'answer-text';
  answerText.textContent = record.answer;

  answerSection.appendChild(answerLabel);
  answerSection.appendChild(answerText);
  article.appendChild(answerSection);

  // Reveal answer button
  const revealAnswerBtn = document.createElement('button');
  revealAnswerBtn.className = 'reveal-answer-btn';
  revealAnswerBtn.textContent = 'Reveal answer';
  if (leader || state.answerShown) {
    revealAnswerBtn.hidden = true;
  } else {
    revealAnswerBtn.hidden = !state.versesShown;
  }

  revealAnswerBtn.addEventListener('click', () => {
    answerSection.hidden = false;
    revealAnswerBtn.hidden = true;
    getCardState(record.qNumber).answerShown = true;
  });

  article.appendChild(revealAnswerBtn);

  return article;
}

// ---------- Citation element ----------

function buildCitation(citation, currentQ, firstSeen) {
  const citDiv = document.createElement('div');
  citDiv.className = 'citation';

  const bq = document.createElement('blockquote');
  if (citation.text) {
    bq.textContent = citation.text;
  } else {
    const ph = document.createElement('span');
    ph.className = 'placeholder-text';
    ph.textContent = '[Scripture text not yet fetched — run scripts/fetch-verses.js]';
    bq.appendChild(ph);
  }

  const cite = document.createElement('cite');
  cite.textContent = citation.reference;

  // Dedup note: if this displayRange was first seen in a different question, say so quietly.
  const firstQ = firstSeen.get(citation.displayRange);
  if (firstQ !== undefined && firstQ !== currentQ) {
    const note = document.createElement('span');
    note.className = 'dedup-note';
    note.textContent = ` (also read under Q${firstQ})`;
    cite.appendChild(note);
  }

  citDiv.appendChild(bq);
  citDiv.appendChild(cite);

  return citDiv;
}

// ---------- Discussion questions ----------

const DISCUSSION_QUESTIONS = {
  15: [
    'What difference does it make that Christ suffered "in body and soul" rather than only physically?',
    'Why does the catechism specify Pontius Pilate — a civil judge — rather than the religious authorities?',
    'Paul calls crucifixion a "curse" (Gal 3:13). How does bearing that curse change how you stand before God?',
  ],
};

function buildDiscussionQuestions(lordsDay) {
  const questions = DISCUSSION_QUESTIONS[lordsDay];
  if (!questions) return null;

  const section = document.createElement('section');
  section.className = 'discussion-questions';

  const heading = document.createElement('h2');
  heading.textContent = 'Discussion Questions';
  section.appendChild(heading);

  const ol = document.createElement('ol');
  for (const q of questions) {
    const li = document.createElement('li');
    li.textContent = q;
    ol.appendChild(li);
  }
  section.appendChild(ol);

  return section;
}

// ---------- Boot ----------

init();
