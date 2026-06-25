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
const DEFAULT_USERNAME = 'bodegaben';
const PLAYER_DISPLAY_NAME = 'Bodega Ben';
const PLAYER_PROFILE_URL = 'https://www.chess.com/member/bodegaben';
const DEFAULT_TIME_CLASS: TimeClass = 'blitz';
const DEFAULT_ARCHIVE_MONTHS = 6;
const TIME_CLASSES: TimeClass[] = ['bullet', 'blitz', 'rapid', 'daily'];

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing app root');
}

let dashboardBoards: Partial<Record<'white' | 'black', any>> = {};
let entryBoard: any = null;
let activePayload: DashboardPayload | null = null;

app.innerHTML = `
  <header id="kpi-strip" class="kpi-strip">
    <div class="strip-profile-links">
      <a id="profile-link" class="strip-platform-label" href="${PLAYER_PROFILE_URL}" target="_blank" rel="noopener">Chess.com</a>
    </div>
    <div class="kpi kpi-sep"></div>
    <div id="top-kpis" class="strip-kpis">
      <div class="kpi kpi-active"><span class="kpi-label">Player</span><span class="kpi-value">${PLAYER_DISPLAY_NAME}</span></div>
      <div class="kpi"><span class="kpi-label">Format</span><span class="kpi-value">${titleCase(DEFAULT_TIME_CLASS)}</span></div>
      <div class="kpi"><span class="kpi-label">Status</span><span class="kpi-value">Ready</span></div>
    </div>
    <form class="analysis-form topbar-form" data-analysis-form>
      <label class="handle-field">
        <span>Handle</span>
        <input name="username" autocomplete="off" spellcheck="false" value="${DEFAULT_USERNAME}" placeholder="${DEFAULT_USERNAME}" required />
      </label>
      <fieldset class="segment" aria-label="Time class">
        ${TIME_CLASSES
          .map((item) => `
            <label>
              <input type="radio" name="time_class" value="${item}" ${item === DEFAULT_TIME_CLASS ? 'checked' : ''} />
              <span>${titleCase(item)}</span>
            </label>
          `)
          .join('')}
      </fieldset>
      <label class="months-field">
        <span>Months</span>
        <input name="max_archives" type="number" min="1" max="36" value="${DEFAULT_ARCHIVE_MONTHS}" />
      </label>
      <button class="primary-button" type="submit">Analyze</button>
    </form>
  </header>

  <main>
    <section id="entry-view" class="entry-view">
      <h2>Analyze player <small>enter a Chess.com handle to generate the dashboard</small></h2>
      <div class="entry-grid">
        <form class="entry-form" data-analysis-form>
          <label class="entry-handle">
            <span>Chess.com handle</span>
            <input name="username" autocomplete="off" spellcheck="false" value="${DEFAULT_USERNAME}" placeholder="${DEFAULT_USERNAME}" required autofocus />
          </label>
          <fieldset class="segment entry-segment" aria-label="Time class">
            ${TIME_CLASSES
              .map((item) => `
                <label>
                  <input type="radio" name="time_class" value="${item}" ${item === DEFAULT_TIME_CLASS ? 'checked' : ''} />
                  <span>${titleCase(item)}</span>
                </label>
              `)
              .join('')}
          </fieldset>
          <div class="entry-actions">
            <label class="months-field">
              <span>Months</span>
              <input name="max_archives" type="number" min="1" max="36" value="${DEFAULT_ARCHIVE_MONTHS}" />
            </label>
            <button class="primary-button entry-button" type="submit">Analyze player</button>
          </div>
        </form>
        <div class="behavior-grid entry-signals">
          <div class="behavior-card"><div class="bh-label">Ratings</div><div class="bh-value">Current</div><div class="bh-sub">Chess.com stats</div></div>
          <div class="behavior-card"><div class="bh-label">Openings</div><div class="bh-value">Observed</div><div class="bh-sub">White and Black tables</div></div>
          <div class="behavior-card"><div class="bh-label">Losses</div><div class="bh-value">Review</div><div class="bh-sub">Recent failure patterns</div></div>
        </div>
        <aside class="entry-board-wrap">
          <div id="entry-board" class="board-large entry-board"></div>
          <div class="board-meta entry-board-meta">
            <div class="name">${PLAYER_DISPLAY_NAME}</div>
            <div class="stats"><a href="${PLAYER_PROFILE_URL}" target="_blank" rel="noopener">Chess.com profile</a></div>
          </div>
        </aside>
      </div>
    </section>

    <section id="dashboard-view" class="dashboard-view" hidden>
      <section class="status-band" id="status-band">
        <h2 id="status-title">Analyzing <small id="status-copy">Preparing dashboard.</small></h2>
        <div class="status-meta" id="status-meta"></div>
      </section>

      <section id="plan-block">
        <h2>Plan &amp; adherence <small>observed mode · recommendations from public games</small></h2>
        <div class="plan-grid" id="recommendations"></div>
      </section>

      <section id="move-quality-block">
        <h2>Move quality <small>metadata pass · engine analysis deferred</small></h2>
        <div id="move-quality-cards" class="behavior-grid"></div>
      </section>

      <section id="move-quality-by-format">
        <h2>By format <small>ratings per time class</small></h2>
        <div id="format-table" class="table-scroll"></div>
      </section>

      <section id="white-block">
        <h2>White <small>click a row to see the position</small></h2>
        <div class="sig-split">
          <div class="table-scroll"><div id="white-opening-table" class="opening-table"></div></div>
          <aside class="board-panel">
            <div id="white-board" class="board-large"></div>
            <div id="white-board-meta" class="board-meta"><span class="empty">White openings will appear here.</span></div>
          </aside>
        </div>
      </section>

      <section id="black-block">
        <h2>Black <small>click a row to see the position</small></h2>
        <div class="sig-split">
          <div class="table-scroll"><div id="black-opening-table" class="opening-table"></div></div>
          <aside class="board-panel">
            <div id="black-board" class="board-large"></div>
            <div id="black-board-meta" class="board-meta"><span class="empty">Black openings will appear here.</span></div>
          </aside>
        </div>
      </section>

      <section id="behavior-block">
        <h2>Behavior — current state</h2>
        <div id="behavior-grid" class="behavior-grid"></div>
      </section>

      <section id="drillin-section">
        <h2>Drill in</h2>
        <div id="drillin-cards" class="drillin-grid"></div>
        <div id="loss-list" class="loss-list"></div>
        <div id="session-list" class="session-list"></div>
      </section>
    </section>
  </main>
`;

entryBoard = createBoard('entry-board', START_FEN, 'white');
wireForms();

function createBoard(elementId: string, fen: string, orientation: 'white' | 'black') {
  const boardEl = document.querySelector<HTMLElement>(`#${elementId}`);
  if (!boardEl) return;
  return Chessground(boardEl, {
    fen,
    orientation,
    coordinates: true,
    viewOnly: true,
    animation: { enabled: true, duration: 160 },
    highlight: { lastMove: true, check: true },
    drawable: { enabled: false, visible: false }
  });
}

function ensureDashboardBoard() {
  if (!dashboardBoards.white) {
    dashboardBoards.white = createBoard('white-board', START_FEN, 'white');
  }
  if (!dashboardBoards.black) {
    dashboardBoards.black = createBoard('black-board', START_FEN, 'black');
  }
}

function wireForms() {
  document.querySelectorAll<HTMLFormElement>('[data-analysis-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const username = String(formData.get('username') || '').trim();
      const timeClass = String(formData.get('time_class') || 'bullet') as TimeClass;
      const maxArchives = Number(formData.get('max_archives') || DEFAULT_ARCHIVE_MONTHS);
      if (!username) return;
      syncForms(username, timeClass, maxArchives);
      await startAnalysis(username, timeClass, maxArchives);
    });
  });
}

async function startAnalysis(username: string, timeClass: TimeClass, maxArchives: number) {
  setBusy(true);
  showDashboardView();
  renderLoadingState();
  setStatus('Analyzing', `Queued ${playerLabel(username)} ${timeClass} analysis.`, '');
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
    setStatus(statusTitle(job.status), job.message, '');
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
  showDashboardView();
  setStatus(`${playerLabel(payload.username)} ${titleCase(payload.time_class)}`, 'Dashboard generated from public Chess.com games.', payload.source.profile_url);
  renderKpis(payload);
  renderMoveQuality(payload);
  renderFormatTable(payload);
  renderRecommendations(payload);
  renderOpeningTable(payload, 'white');
  renderOpeningTable(payload, 'black');
  renderLosses(payload);
  renderBehavior(payload);
  renderSessions(payload);
  renderDrillIn(payload);

  const firstWhite = payload.openings.find((row) => row.side === 'white' && row.representative_fen);
  const firstBlack = payload.openings.find((row) => row.side === 'black' && row.representative_fen);
  if (firstWhite) {
    selectOpening(firstWhite);
  }
  if (firstBlack) {
    selectOpening(firstBlack);
  }
}

function renderLoadingState() {
  const topKpis = document.querySelector('#top-kpis');
  if (topKpis) {
    topKpis.innerHTML = [
      kpiCard('Rating', '--', 'Fetching'),
      kpiCard('Recent form', '--', 'Computing'),
      kpiCard('Games', '--', 'Parsing archives'),
      kpiCard('Move quality', 'Deferred', 'Stockfish optional')
    ].join('');
  }
  const recommendations = document.querySelector('#recommendations');
  if (recommendations) recommendations.innerHTML = '';
  const whiteTable = document.querySelector('#white-opening-table');
  if (whiteTable) whiteTable.innerHTML = '';
  const blackTable = document.querySelector('#black-opening-table');
  if (blackTable) blackTable.innerHTML = '';
  const formatTable = document.querySelector('#format-table');
  if (formatTable) formatTable.innerHTML = '';
  const moveQuality = document.querySelector('#move-quality-cards');
  if (moveQuality) moveQuality.innerHTML = '';
  const drillIn = document.querySelector('#drillin-cards');
  if (drillIn) drillIn.innerHTML = '';
  const lossList = document.querySelector('#loss-list');
  if (lossList) lossList.innerHTML = '';
  const behavior = document.querySelector('#behavior-grid');
  if (behavior) behavior.innerHTML = '';
  const sessions = document.querySelector('#session-list');
  if (sessions) sessions.innerHTML = '';
  const whiteMeta = document.querySelector('#white-board-meta');
  if (whiteMeta) whiteMeta.innerHTML = '<span class="empty">White openings will appear here.</span>';
  const blackMeta = document.querySelector('#black-board-meta');
  if (blackMeta) blackMeta.innerHTML = '<span class="empty">Black openings will appear here.</span>';
  if (dashboardBoards.white?.set) {
    dashboardBoards.white.set({ fen: START_FEN, orientation: 'white' });
  }
  if (dashboardBoards.black?.set) {
    dashboardBoards.black.set({ fen: START_FEN, orientation: 'black' });
  }
}

function renderKpis(payload: DashboardPayload) {
  const topKpis = document.querySelector('#top-kpis');
  if (!topKpis) return;
  const rating = payload.ratings.current == null ? '--' : String(payload.ratings.current);
  const delta = formatSigned(payload.recent_form.rating_delta);
  topKpis.innerHTML = [
    kpiCard('Rating', rating, 'Current'),
    kpiCard('Recent form', `${payload.recent_form.score_pct}%`, `${payload.recent_form.record} / ${delta}`),
    kpiCard('Games', String(payload.source.games_used), `${payload.source.archives_used} archives`),
    kpiCard('Updated', new Date(payload.generated_at).toLocaleString(), 'Generated'),
    kpiCard('Move quality', titleCase(payload.move_quality.status), 'Engine pass later')
  ].join('');
  const profileLink = document.querySelector<HTMLAnchorElement>('#profile-link');
  if (profileLink) profileLink.href = payload.source.profile_url;
}

function renderMoveQuality(payload: DashboardPayload) {
  const root = document.querySelector('#move-quality-cards');
  if (!root) return;
  const process = payload.behavior.process;
  root.innerHTML = [
    behaviorCard('Status', titleCase(payload.move_quality.status), payload.move_quality.summary),
    behaviorCard('Clock move 10', process.median_clock_move_10 == null ? '--' : `${process.median_clock_move_10}s`, 'Median clock after move 10'),
    behaviorCard('Clock move 20', process.median_clock_move_20 == null ? '--' : `${process.median_clock_move_20}s`, 'Median clock after move 20')
  ].join('');
}

function renderFormatTable(payload: DashboardPayload) {
  const root = document.querySelector('#format-table');
  if (!root) return;
  const rows = TIME_CLASSES
    .filter((item) => payload.ratings.by_format[item] != null || item === payload.time_class)
    .map((item) => {
      const current = item === payload.time_class;
      const rating = payload.ratings.by_format[item] == null ? '--' : String(payload.ratings.by_format[item]);
      const games = current ? String(payload.source.games_used) : '--';
      return `
        <tr${current ? ' class="mqf-current"' : ''}>
          <td>${titleCase(item)}${current ? ' ◂' : ''}</td>
          <td>${rating}</td>
          <td>${games}</td>
          <td>${current ? `${payload.source.archives_used} archives` : '--'}</td>
        </tr>
      `;
    })
    .join('');
  root.innerHTML = `
    <table class="mqf-table">
      <thead><tr><th>Format</th><th>Rating</th><th>Games</th><th>Sample</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderRecommendations(payload: DashboardPayload) {
  const root = document.querySelector('#recommendations');
  if (!root) return;
  root.innerHTML = payload.recommendations
    .map((item) => `
      <article class="plan-card severity-green">
        <div class="plan-head">
          <span class="plan-vs">Study next</span>
          <span class="plan-name">${escapeHtml(item.title)}</span>
        </div>
        <div class="plan-counts">${escapeHtml(item.reason)}</div>
        <p class="plan-plan">${escapeHtml(item.action)}</p>
      </article>
    `)
    .join('');
}

function renderOpeningTable(payload: DashboardPayload | null, side: 'white' | 'black') {
  const root = document.querySelector(`#${side}-opening-table`);
  if (!root) return;
  if (!payload) {
    root.innerHTML = '';
    return;
  }
  const rows = payload.openings.filter((row) => row.side === side).slice(0, 18);
  if (rows.length === 0) {
    root.innerHTML = `<div class="table-empty">No ${side} openings in this sample.</div>`;
    return;
  }
  root.innerHTML = `
    <div class="opening-header">
      <span>Opening</span><span>Games</span><span>Score</span><span>Rating</span><span>Flag</span><span>Mate</span><span>Form</span>
    </div>
    ${rows
      .map((row, index) => `
        <button class="opening-row" type="button" data-index="${index}" data-side="${row.side}" data-family="${escapeHtml(row.family)}">
          <span>
            <strong>${escapeHtml(row.family)}</strong>
            <small>${escapeHtml(row.eco || row.sample_moves || 'Unclassified')}</small>
          </span>
          <span>${row.games}</span>
          <span>${row.score_pct}%</span>
          <span>${formatSigned(row.rating_delta)}</span>
          <span>${row.timeout_losses}</span>
          <span>${row.mate_losses}</span>
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
  const board = dashboardBoards[row.side];
  if (row.representative_fen && board?.set) {
    board.set({
      fen: row.representative_fen,
      orientation: row.side
    });
  }
  const meta = document.querySelector(`#${row.side}-board-meta`);
  if (!meta) return;
  meta.innerHTML = `
    <div class="name">${escapeHtml(row.family)}</div>
    <div class="stats">${titleCase(row.side)} / ${row.games} games / ${row.score_pct}% score / ${formatSigned(row.rating_delta)} rating</div>
    <div class="detail">
      <div class="row"><span class="k">Record</span><span class="v">${escapeHtml(row.record)}</span></div>
      <div class="row"><span class="k">Avg opponent</span><span class="v">${row.avg_opp_rating}</span></div>
      <div class="row"><span class="k">Timeout losses</span><span class="v">${row.timeout_losses}</span></div>
      <div class="row"><span class="k">Mate losses</span><span class="v">${row.mate_losses}</span></div>
    </div>
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
    behaviorCard('Loss rate', `${payload.behavior.loss_rate_pct}%`, `${payload.behavior.sample_games} games`),
    behaviorCard('Timeout loss', `${payload.behavior.timeout_loss_pct}%`, 'Of losses'),
    behaviorCard('Mate loss', `${payload.behavior.mate_loss_pct}%`, 'Of losses'),
    behaviorCard('Loss streak', String(payload.behavior.longest_recent_loss_streak), 'Recent max'),
    behaviorCard('Clock move 10', process.median_clock_move_10 == null ? '--' : `${process.median_clock_move_10}s`, 'Median'),
    behaviorCard('Clock move 20', process.median_clock_move_20 == null ? '--' : `${process.median_clock_move_20}s`, 'Median')
  ].join('');
}

function renderDrillIn(payload: DashboardPayload) {
  const root = document.querySelector('#drillin-cards');
  if (!root) return;
  const worstOpening = payload.openings[0];
  const recentTimeouts = payload.recent_losses.filter((loss) => loss.loss_type === 'timeout').length;
  const recentMates = payload.recent_losses.filter((loss) => loss.loss_type === 'checkmated').length;
  const lastSession = payload.behavior.sessions[payload.behavior.sessions.length - 1];
  root.innerHTML = [
    drillCard('Openings', worstOpening ? worstOpening.family : 'No sample', worstOpening ? `${worstOpening.games} games / ${worstOpening.score_pct}% score` : 'Run a larger sample'),
    drillCard('Recent losses', String(payload.recent_losses.length), `${recentTimeouts} timeout, ${recentMates} checkmated`, payload.recent_losses.length > 0),
    drillCard('Process', payload.behavior.process.games_with_clock_data ? `${payload.behavior.process.games_with_clock_data} games` : 'No clock', 'Clock data coverage'),
    drillCard('Last session', lastSession ? formatSigned(lastSession.rating_delta) : '--', lastSession ? `${lastSession.games} games / ${lastSession.record}` : 'No session data')
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
    <div class="kpi">
      <span class="kpi-label">${escapeHtml(label)}</span>
      <span class="kpi-value${label === 'Recent form' && value !== '--' && Number.parseFloat(value) >= 50 ? ' accent' : ''}">${escapeHtml(value)}</span>
      <span class="kpi-sub">${escapeHtml(sub)}</span>
    </div>
  `;
}

function behaviorCard(label: string, value: string, sub: string) {
  return `
    <div class="behavior-card">
      <div class="bh-label">${escapeHtml(label)}</div>
      <div class="bh-value">${escapeHtml(value)}</div>
      <div class="bh-sub">${escapeHtml(sub)}</div>
    </div>
  `;
}

function drillCard(label: string, headline: string, sub: string, alert = false) {
  return `
    <div class="card${alert ? ' alert' : ''}">
      <div class="label">${escapeHtml(label)}</div>
      <div class="headline">${escapeHtml(headline)}</div>
      <div class="sub">${escapeHtml(sub)}</div>
    </div>
  `;
}

function setStatus(title: string, copy: string, profileUrl: string) {
  const titleEl = document.querySelector('#status-title');
  const copyEl = document.querySelector('#status-copy');
  const meta = document.querySelector('#status-meta');
  if (titleEl) {
    titleEl.innerHTML = `${escapeHtml(title)} <small id="status-copy">${escapeHtml(copy)}</small>`;
  }
  if (copyEl) copyEl.textContent = copy;
  if (meta) {
    meta.innerHTML = profileUrl
      ? `<a href="${escapeAttr(profileUrl)}" target="_blank" rel="noopener">Chess.com profile</a>`
      : '';
  }
}

function setBusy(isBusy: boolean) {
  document.querySelectorAll<HTMLButtonElement>('[data-analysis-form] button[type="submit"]').forEach((button) => {
    button.disabled = isBusy;
    button.textContent = isBusy
      ? 'Running'
      : button.classList.contains('entry-button') ? 'Analyze player' : 'Analyze';
  });
}

function showDashboardView() {
  const entryView = document.querySelector<HTMLElement>('#entry-view');
  const dashboardView = document.querySelector<HTMLElement>('#dashboard-view');
  if (entryView) entryView.hidden = true;
  if (dashboardView) dashboardView.hidden = false;
  ensureDashboardBoard();
}

function syncForms(username: string, timeClass: TimeClass, maxArchives: number) {
  document.querySelectorAll<HTMLFormElement>('[data-analysis-form]').forEach((form) => {
    const usernameInput = form.querySelector<HTMLInputElement>('input[name="username"]');
    const monthsInput = form.querySelector<HTMLInputElement>('input[name="max_archives"]');
    const timeInput = form.querySelector<HTMLInputElement>(`input[name="time_class"][value="${timeClass}"]`);
    if (usernameInput) usernameInput.value = username;
    if (monthsInput) monthsInput.value = String(maxArchives);
    if (timeInput) timeInput.checked = true;
  });
}

function formStrip(form: string[]) {
  return form
    .map((item) => `<i class="${item === 'W' ? 'win' : item === 'D' ? 'draw' : 'loss'}">${item}</i>`)
    .join('');
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function playerLabel(username: string) {
  return username.toLowerCase() === DEFAULT_USERNAME ? PLAYER_DISPLAY_NAME : username;
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
