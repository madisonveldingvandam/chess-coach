import { Chessground } from '@lichess-org/chessground';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './styles.css';

type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'daily';
type JobStatus = 'queued' | 'running' | 'complete' | 'failed';

type AnalysisJob = {
  id: string;
  username: string;
  time_class: TimeClass;
  status: JobStatus;
  message: string;
  result?: DashboardPayload;
  error?: string;
};

type DashboardPayload = {
  username: string;
  time_class: TimeClass;
  generated_at: string;
  source: {
    platform: string;
    profile_url: string;
    archives_used: number;
    games_used: number;
  };
  ratings: {
    current: number | null;
    by_format: Partial<Record<TimeClass, number>>;
  };
  recent_form: {
    games: number;
    score_pct: number;
    record: string;
    rating_delta: number;
    form: string[];
  };
  openings: OpeningRow[];
  recent_losses: LossRow[];
  behavior: {
    sample_games: number;
    loss_rate_pct: number;
    timeout_loss_pct: number;
    mate_loss_pct: number;
    longest_recent_loss_streak: number;
    sessions: SessionRow[];
    process: {
      median_clock_move_10: number | null;
      median_clock_move_20: number | null;
      games_with_clock_data: number;
    };
  };
  recommendations: Recommendation[];
  repertoire: { mode: string; note: string };
  move_quality: { status: string; summary: string };
};

type OpeningRow = {
  family: string;
  side: 'white' | 'black';
  eco: string | null;
  games: number;
  record: string;
  win_pct: number;
  score_pct: number;
  rating_delta: number;
  avg_opp_rating: number;
  timeout_losses: number;
  mate_losses: number;
  form: string[];
  representative_fen: string | null;
  sample_moves: string | null;
  priority: number;
};

type LossRow = {
  url: string;
  date: string;
  opening: string;
  family: string;
  side: 'white' | 'black';
  loss_type: string;
  moves: number;
  final_clock: number | null;
  rating_delta: number | null;
  opponent_rating: number;
  opening_fen: string | null;
  review_prompt: string;
};

type SessionRow = {
  start: string;
  games: number;
  record: string;
  rating_delta: number;
  duration_minutes: number;
  tilt_flag: boolean;
};

type Recommendation = {
  title: string;
  reason: string;
  action: string;
};

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing app root');
}

let board: any = null;
let activePayload: DashboardPayload | null = null;

app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark">Cc</div>
      <div>
        <div class="brand-name">Chess Coach</div>
        <div class="brand-sub">Chess.com analytics</div>
      </div>
    </div>
    <form id="analysis-form" class="analysis-form">
      <label class="handle-field">
        <span>Handle</span>
        <input id="username" name="username" autocomplete="off" spellcheck="false" placeholder="Chess.com username" required />
      </label>
      <fieldset class="segment" aria-label="Time class">
        ${(['bullet', 'blitz', 'rapid', 'daily'] as TimeClass[])
          .map((item) => `
            <label>
              <input type="radio" name="time_class" value="${item}" ${item === 'bullet' ? 'checked' : ''} />
              <span>${titleCase(item)}</span>
            </label>
          `)
          .join('')}
      </fieldset>
      <label class="months-field">
        <span>Months</span>
        <input id="max-archives" name="max_archives" type="number" min="1" max="36" value="3" />
      </label>
      <button id="submit-button" class="primary-button" type="submit">Analyze</button>
    </form>
  </header>

  <main class="shell">
    <section class="status-band" id="status-band">
      <div>
        <h1>Enter a handle</h1>
        <p id="status-copy">Ready for a public Chess.com profile.</p>
      </div>
      <div class="status-meta" id="status-meta"></div>
    </section>

    <section class="kpi-grid" id="kpi-grid"></section>

    <section class="main-grid">
      <div class="left-flow">
        <section class="panel">
          <div class="panel-head">
            <h2>Recommendations</h2>
            <span id="recommendation-count"></span>
          </div>
          <div class="recommendations" id="recommendations"></div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Opening families</h2>
            <div class="table-tools">
              <button class="side-filter active" data-side="all" type="button">All</button>
              <button class="side-filter" data-side="white" type="button">White</button>
              <button class="side-filter" data-side="black" type="button">Black</button>
            </div>
          </div>
          <div class="opening-table" id="opening-table"></div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Recent losses</h2>
            <span id="loss-count"></span>
          </div>
          <div class="loss-list" id="loss-list"></div>
        </section>
      </div>

      <aside class="right-rail">
        <section class="board-section">
          <div id="board" class="board"></div>
          <div id="board-meta" class="board-meta">Observed openings will appear here.</div>
        </section>

        <section class="panel compact">
          <div class="panel-head">
            <h2>Behavior</h2>
          </div>
          <div class="behavior-grid" id="behavior-grid"></div>
        </section>

        <section class="panel compact">
          <div class="panel-head">
            <h2>Sessions</h2>
          </div>
          <div class="session-list" id="session-list"></div>
        </section>
      </aside>
    </section>
  </main>
`;

initializeBoard(START_FEN, 'white');
wireForm();
wireSideFilters();
renderEmptyState();

function initializeBoard(fen: string, orientation: 'white' | 'black') {
  const boardEl = document.querySelector<HTMLElement>('#board');
  if (!boardEl) return;
  board = Chessground(boardEl, {
    fen,
    orientation,
    coordinates: true,
    viewOnly: true,
    animation: { enabled: true, duration: 160 },
    highlight: { lastMove: true, check: true },
    drawable: { enabled: false, visible: false }
  });
}

function wireForm() {
  const form = document.querySelector<HTMLFormElement>('#analysis-form');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const username = String(formData.get('username') || '').trim();
    const timeClass = String(formData.get('time_class') || 'bullet') as TimeClass;
    const maxArchives = Number(formData.get('max_archives') || 3);
    if (!username) return;
    await startAnalysis(username, timeClass, maxArchives);
  });
}

function wireSideFilters() {
  document.querySelectorAll<HTMLButtonElement>('.side-filter').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.side-filter').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      renderOpenings(activePayload, button.dataset.side || 'all');
    });
  });
}

async function startAnalysis(username: string, timeClass: TimeClass, maxArchives: number) {
  setBusy(true);
  setStatus('Analyzing', `Queued ${username} ${timeClass} analysis.`, '');
  try {
    const response = await fetch('/api/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        time_class: timeClass,
        max_archives: maxArchives,
        force: false
      })
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const job = (await response.json()) as AnalysisJob;
    await pollJob(job.id);
  } catch (error) {
    setStatus('Analysis failed', error instanceof Error ? error.message : String(error), '');
  } finally {
    setBusy(false);
  }
}

async function pollJob(jobId: string) {
  for (;;) {
    const response = await fetch(`/api/analyses/${jobId}`);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const job = (await response.json()) as AnalysisJob;
    setStatus(statusTitle(job.status), job.message, job.username);
    if (job.status === 'complete' && job.result) {
      activePayload = job.result;
      renderDashboard(job.result);
      return;
    }
    if (job.status === 'failed') {
      throw new Error(job.error || 'Unknown analysis error');
    }
    await delay(1200);
  }
}

function renderDashboard(payload: DashboardPayload) {
  setStatus(`${payload.username} ${titleCase(payload.time_class)}`, 'Dashboard generated from public Chess.com games.', payload.source.profile_url);
  renderKpis(payload);
  renderRecommendations(payload);
  renderOpenings(payload, activeSideFilter());
  renderLosses(payload);
  renderBehavior(payload);
  renderSessions(payload);

  const firstOpening = payload.openings.find((row) => row.representative_fen);
  if (firstOpening) {
    selectOpening(firstOpening);
  }
}

function renderEmptyState() {
  const kpiGrid = document.querySelector('#kpi-grid');
  if (kpiGrid) {
    kpiGrid.innerHTML = [
      kpiCard('Rating', '--', 'Current'),
      kpiCard('Recent form', '--', 'Last 20'),
      kpiCard('Games', '--', 'Selected archives'),
      kpiCard('Move quality', 'Deferred', 'Stockfish optional')
    ].join('');
  }
  const recommendations = document.querySelector('#recommendations');
  if (recommendations) recommendations.innerHTML = '';
  const openingTable = document.querySelector('#opening-table');
  if (openingTable) openingTable.innerHTML = '';
  const lossList = document.querySelector('#loss-list');
  if (lossList) lossList.innerHTML = '';
  const behavior = document.querySelector('#behavior-grid');
  if (behavior) behavior.innerHTML = '';
  const sessions = document.querySelector('#session-list');
  if (sessions) sessions.innerHTML = '';
}

function renderKpis(payload: DashboardPayload) {
  const kpiGrid = document.querySelector('#kpi-grid');
  if (!kpiGrid) return;
  const rating = payload.ratings.current == null ? '--' : String(payload.ratings.current);
  const delta = formatSigned(payload.recent_form.rating_delta);
  kpiGrid.innerHTML = [
    kpiCard('Rating', rating, 'Current'),
    kpiCard('Recent form', `${payload.recent_form.score_pct}%`, `${payload.recent_form.record} / ${delta}`),
    kpiCard('Games', String(payload.source.games_used), `${payload.source.archives_used} archives`),
    kpiCard('Move quality', titleCase(payload.move_quality.status), 'Engine pass later')
  ].join('');
}

function renderRecommendations(payload: DashboardPayload) {
  const root = document.querySelector('#recommendations');
  const count = document.querySelector('#recommendation-count');
  if (!root) return;
  if (count) count.textContent = `${payload.recommendations.length}`;
  root.innerHTML = payload.recommendations
    .map((item) => `
      <article class="recommendation">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.reason)}</p>
        <div>${escapeHtml(item.action)}</div>
      </article>
    `)
    .join('');
}

function renderOpenings(payload: DashboardPayload | null, side: string) {
  const root = document.querySelector('#opening-table');
  if (!root) return;
  if (!payload) {
    root.innerHTML = '';
    return;
  }
  const rows = payload.openings.filter((row) => side === 'all' || row.side === side).slice(0, 18);
  root.innerHTML = `
    <div class="opening-header">
      <span>Opening</span><span>Side</span><span>Games</span><span>Score</span><span>Rating</span><span>Form</span>
    </div>
    ${rows
      .map((row, index) => `
        <button class="opening-row" type="button" data-index="${index}" data-family="${escapeHtml(row.family)}">
          <span>
            <strong>${escapeHtml(row.family)}</strong>
            <small>${escapeHtml(row.eco || row.sample_moves || 'Unclassified')}</small>
          </span>
          <span>${titleCase(row.side)}</span>
          <span>${row.games}</span>
          <span>${row.score_pct}%</span>
          <span>${formatSigned(row.rating_delta)}</span>
          <span class="form-strip">${formStrip(row.form)}</span>
        </button>
      `)
      .join('')}
  `;
  root.querySelectorAll<HTMLButtonElement>('.opening-row').forEach((button, index) => {
    button.addEventListener('click', () => selectOpening(rows[index]));
  });
}

function selectOpening(row: OpeningRow) {
  if (row.representative_fen && board?.set) {
    board.set({
      fen: row.representative_fen,
      orientation: row.side
    });
  }
  const meta = document.querySelector('#board-meta');
  if (!meta) return;
  meta.innerHTML = `
    <div class="board-title">${escapeHtml(row.family)}</div>
    <div class="board-sub">${titleCase(row.side)} / ${row.games} games / ${row.score_pct}% score</div>
    <div class="board-line">${escapeHtml(row.sample_moves || 'No opening move line available.')}</div>
  `;
}

function renderLosses(payload: DashboardPayload) {
  const root = document.querySelector('#loss-list');
  const count = document.querySelector('#loss-count');
  if (!root) return;
  if (count) count.textContent = `${payload.recent_losses.length}`;
  root.innerHTML = payload.recent_losses
    .map((loss) => `
      <article class="loss-row">
        <div>
          <strong>${escapeHtml(loss.family)}</strong>
          <small>${escapeHtml(loss.date)} / ${titleCase(loss.side)} / ${escapeHtml(loss.loss_type)}</small>
        </div>
        <div>${loss.moves} moves</div>
        <div>${loss.final_clock == null ? '--' : `${loss.final_clock}s`}</div>
        <a href="${escapeAttr(loss.url)}" target="_blank" rel="noopener">Game</a>
        <p>${escapeHtml(loss.review_prompt)}</p>
      </article>
    `)
    .join('');
}

function renderBehavior(payload: DashboardPayload) {
  const root = document.querySelector('#behavior-grid');
  if (!root) return;
  const process = payload.behavior.process;
  root.innerHTML = [
    metricCell('Loss rate', `${payload.behavior.loss_rate_pct}%`, `${payload.behavior.sample_games} games`),
    metricCell('Timeout loss', `${payload.behavior.timeout_loss_pct}%`, 'Of losses'),
    metricCell('Mate loss', `${payload.behavior.mate_loss_pct}%`, 'Of losses'),
    metricCell('Loss streak', String(payload.behavior.longest_recent_loss_streak), 'Recent max'),
    metricCell('Clock move 10', process.median_clock_move_10 == null ? '--' : `${process.median_clock_move_10}s`, 'Median'),
    metricCell('Clock move 20', process.median_clock_move_20 == null ? '--' : `${process.median_clock_move_20}s`, 'Median')
  ].join('');
}

function renderSessions(payload: DashboardPayload) {
  const root = document.querySelector('#session-list');
  if (!root) return;
  root.innerHTML = payload.behavior.sessions
    .slice()
    .reverse()
    .map((session) => `
      <div class="session-row ${session.tilt_flag ? 'flagged' : ''}">
        <span>${new Date(session.start).toLocaleDateString()}</span>
        <span>${session.games} games</span>
        <span>${session.record}</span>
        <strong>${formatSigned(session.rating_delta)}</strong>
      </div>
    `)
    .join('');
}

function kpiCard(label: string, value: string, sub: string) {
  return `
    <article class="kpi-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(sub)}</small>
    </article>
  `;
}

function metricCell(label: string, value: string, sub: string) {
  return `
    <div class="metric-cell">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(sub)}</small>
    </div>
  `;
}

function setStatus(title: string, copy: string, profileUrl: string) {
  const titleEl = document.querySelector('#status-band h1');
  const copyEl = document.querySelector('#status-copy');
  const meta = document.querySelector('#status-meta');
  if (titleEl) titleEl.textContent = title;
  if (copyEl) copyEl.textContent = copy;
  if (meta) {
    meta.innerHTML = profileUrl
      ? `<a href="${escapeAttr(profileUrl)}" target="_blank" rel="noopener">Chess.com profile</a>`
      : '';
  }
}

function setBusy(isBusy: boolean) {
  const button = document.querySelector<HTMLButtonElement>('#submit-button');
  if (!button) return;
  button.disabled = isBusy;
  button.textContent = isBusy ? 'Running' : 'Analyze';
}

function activeSideFilter() {
  return document.querySelector<HTMLElement>('.side-filter.active')?.dataset.side || 'all';
}

function formStrip(form: string[]) {
  return form
    .map((item) => `<i class="${item === 'W' ? 'win' : item === 'D' ? 'draw' : 'loss'}">${item}</i>`)
    .join('');
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function formatSigned(value: number | null) {
  if (value == null) return '--';
  return value > 0 ? `+${value}` : String(value);
}

function statusTitle(status: JobStatus) {
  if (status === 'queued') return 'Queued';
  if (status === 'running') return 'Analyzing';
  if (status === 'complete') return 'Complete';
  return 'Failed';
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function escapeHtml(value: unknown) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value: unknown) {
  return escapeHtml(value);
}
