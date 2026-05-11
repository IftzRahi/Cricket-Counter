const STORAGE_KEY = "cricket-counter-state-v1";

const elements = {
  matchTitle: document.querySelector("#match-title"),
  inningsLabel: document.querySelector("#innings-label"),
  scoreText: document.querySelector("#score-text"),
  oversText: document.querySelector("#overs-text"),
  runRate: document.querySelector("#run-rate"),
  requiredRateMeta: document.querySelector("#required-rate-meta"),
  targetMeta: document.querySelector("#target-meta"),
  freeHitMeta: document.querySelector("#free-hit-meta"),
  statusLine: document.querySelector("#status-line"),
  battersList: document.querySelector("#batters-list"),
  battingCard: document.querySelector("#batting-card"),
  bowlerSelect: document.querySelector("#bowler-select"),
  bowlingCard: document.querySelector("#bowling-card"),
  inningsSummary: document.querySelector("#innings-summary"),
  matchReport: document.querySelector("#match-report"),
  deliveryLog: document.querySelector("#delivery-log"),
  wideTotal: document.querySelector("#wide-total"),
  noBallTotal: document.querySelector("#noball-total"),
  byeTotal: document.querySelector("#bye-total"),
  legByeTotal: document.querySelector("#legbye-total"),
  teamAInput: document.querySelector("#team-a-input"),
  teamBInput: document.querySelector("#team-b-input"),
  oversInput: document.querySelector("#overs-input"),
  batFirstInput: document.querySelector("#bat-first-input")
};

let state = normalizeState(loadState()) || createMatch({
  teamA: "Riverside XI",
  teamB: "Harbor CC",
  overs: 20,
  battingFirst: "teamA"
});

render();

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.run !== undefined) {
    scoreRuns(Number(button.dataset.run));
    return;
  }

  if (button.dataset.extraKind) {
    scoreExtra(button.dataset.extraKind, Number(button.dataset.extraTaken));
    return;
  }

  const action = button.dataset.action;
  if (!action) return;

  const actions = {
    "start-match": startMatchFromInputs,
    "new-match": newMatch,
    "add-bowler": addBowler,
    "download-report": downloadMatchReportPdf,
    "swap-strike": manualSwapStrike,
    "end-innings": endInnings,
    "start-next-innings": startNextInnings,
    wicket: takeWicket,
    undo
  };

  actions[action]?.();
});

document.addEventListener("change", (event) => {
  const batterInput = event.target.closest("[data-batter-name]");
  if (batterInput) {
    updateBatterName(Number(batterInput.dataset.batterName), batterInput.value);
    return;
  }

  const bowlerInput = event.target.closest("[data-bowler-name]");
  if (bowlerInput) {
    updateBowlerName(Number(bowlerInput.dataset.bowlerName), bowlerInput.value);
    return;
  }

  if (event.target === elements.bowlerSelect) {
    setCurrentBowler(Number(elements.bowlerSelect.value));
  }
});

function createMatch(config) {
  const teamA = cleanName(config.teamA, "Team A");
  const teamB = cleanName(config.teamB, "Team B");
  const battingFirst = config.battingFirst === "teamB" ? "teamB" : "teamA";
  const firstBatting = battingFirst === "teamA" ? teamA : teamB;
  const firstBowling = battingFirst === "teamA" ? teamB : teamA;

  return {
    match: {
      teamA,
      teamB,
      overs: clampOvers(config.overs),
      battingFirst
    },
    inningsIndex: 0,
    innings: [createInnings(firstBatting, firstBowling)],
    history: []
  };
}

function createInnings(battingTeam, bowlingTeam) {
  return {
    battingTeam,
    bowlingTeam,
    runs: 0,
    wickets: 0,
    balls: 0,
    extras: {
      wide: 0,
      noBall: 0,
      bye: 0,
      legBye: 0
    },
    batsmen: [
      createBatter(1, "Batter 1"),
      createBatter(2, "Batter 2")
    ],
    strikerId: 1,
    nonStrikerId: 2,
    nextBatter: 3,
    bowlers: [
      createBowler(1, "Bowler 1")
    ],
    currentBowlerId: 1,
    nextBowler: 2,
    lastOverBowlerId: null,
    mustChangeBowler: false,
    freeHit: false,
    fallOfWickets: [],
    deliveries: [],
    complete: false,
    completionReason: ""
  };
}

function createBatter(id, name) {
  return {
    id,
    name,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    out: false
  };
}

function createBowler(id, name) {
  return {
    id,
    name,
    balls: 0,
    runsConceded: 0,
    wickets: 0
  };
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function normalizeState(candidate) {
  if (!candidate || !candidate.match || !Array.isArray(candidate.innings) || !candidate.innings.length) return null;

  candidate.match.teamA = cleanName(candidate.match.teamA, "Team A");
  candidate.match.teamB = cleanName(candidate.match.teamB, "Team B");
  candidate.match.overs = clampOvers(candidate.match.overs);
  candidate.match.battingFirst = candidate.match.battingFirst === "teamB" ? "teamB" : "teamA";
  candidate.inningsIndex = Math.min(Math.max(Number(candidate.inningsIndex) || 0, 0), candidate.innings.length - 1);
  candidate.innings.forEach(normalizeInnings);

  candidate.history = Array.isArray(candidate.history)
    ? candidate.history.map((snapshot) => normalizeState({ ...snapshot, history: [] })).filter(Boolean)
    : [];

  return candidate;
}

function normalizeInnings(innings) {
  innings.runs = Number(innings.runs) || 0;
  innings.wickets = Number(innings.wickets) || 0;
  innings.balls = Number(innings.balls) || 0;
  innings.extras = {
    wide: Number(innings.extras?.wide) || 0,
    noBall: Number(innings.extras?.noBall) || 0,
    bye: Number(innings.extras?.bye) || 0,
    legBye: Number(innings.extras?.legBye) || 0
  };

  innings.batsmen = Array.isArray(innings.batsmen) && innings.batsmen.length
    ? innings.batsmen.map((batter, index) => ({
        id: Number(batter.id) || index + 1,
        name: cleanName(batter.name, `Batter ${index + 1}`),
        runs: Number(batter.runs) || 0,
        balls: Number(batter.balls) || 0,
        fours: Number(batter.fours) || 0,
        sixes: Number(batter.sixes) || 0,
        out: Boolean(batter.out)
      }))
    : [createBatter(1, "Batter 1"), createBatter(2, "Batter 2")];

  const strikerId = Number(innings.strikerId);
  const nonStrikerId = Number(innings.nonStrikerId);
  innings.strikerId = innings.batsmen.some((batter) => batter.id === strikerId)
    ? strikerId
    : innings.batsmen[0].id;
  innings.nonStrikerId = innings.batsmen.some((batter) => batter.id === nonStrikerId)
    ? nonStrikerId
    : innings.batsmen.find((batter) => batter.id !== innings.strikerId)?.id || innings.strikerId;
  innings.nextBatter = Math.max(...innings.batsmen.map((batter) => batter.id), 0) + 1;

  innings.bowlers = Array.isArray(innings.bowlers) && innings.bowlers.length
    ? innings.bowlers.map((bowler, index) => ({
        id: Number(bowler.id) || index + 1,
        name: cleanName(bowler.name, `Bowler ${index + 1}`),
        balls: Number(bowler.balls) || 0,
        runsConceded: Number(bowler.runsConceded) || 0,
        wickets: Number(bowler.wickets) || 0
      }))
    : [createBowler(1, "Bowler 1")];

  const currentBowlerId = Number(innings.currentBowlerId);
  innings.currentBowlerId = innings.bowlers.some((bowler) => bowler.id === currentBowlerId)
    ? currentBowlerId
    : innings.bowlers[0].id;
  innings.nextBowler = Math.max(...innings.bowlers.map((bowler) => bowler.id), 0) + 1;
  innings.lastOverBowlerId = Number(innings.lastOverBowlerId) || null;
  innings.mustChangeBowler = Boolean(innings.mustChangeBowler);
  innings.freeHit = Boolean(innings.freeHit);
  innings.fallOfWickets = Array.isArray(innings.fallOfWickets) ? innings.fallOfWickets : [];
  innings.deliveries = Array.isArray(innings.deliveries) ? innings.deliveries : [];
  innings.complete = Boolean(innings.complete);
  innings.completionReason = innings.completionReason || "";
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function pushHistory() {
  const snapshot = cloneState({ ...state, history: [] });
  state.history.push(snapshot);
  if (state.history.length > 80) state.history.shift();
}

function undo() {
  if (!state.history.length) return;
  const remainingHistory = state.history.slice(0, -1);
  state = state.history[state.history.length - 1];
  state.history = remainingHistory;
  saveAndRender();
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function startMatchFromInputs() {
  const hasScore = state.innings.some((innings) => innings.runs || innings.balls || innings.wickets);
  if (hasScore && !window.confirm("Start a fresh match and clear the current score?")) return;

  state = createMatch({
    teamA: elements.teamAInput.value,
    teamB: elements.teamBInput.value,
    overs: Number(elements.oversInput.value),
    battingFirst: elements.batFirstInput.value
  });
  saveAndRender();
}

function newMatch() {
  if (!window.confirm("Clear this match and start again?")) return;
  state = createMatch({
    teamA: state.match.teamA,
    teamB: state.match.teamB,
    overs: state.match.overs,
    battingFirst: state.match.battingFirst
  });
  saveAndRender();
}

function scoreRuns(runs) {
  const innings = currentInnings();
  if (!canScore(innings)) return;

  addDelivery({
    label: String(runs),
    note: `${striker(innings).name} scored ${runs}`,
    teamRuns: runs,
    extraRuns: 0,
    bowlerRuns: runs,
    legal: true,
    batsmanRuns: runs,
    rotationRuns: runs,
    type: "run"
  });
}

function scoreExtra(kind, takenRuns) {
  const innings = currentInnings();
  if (!canScore(innings)) return;

  const legal = kind === "bye" || kind === "legBye";
  const completedRuns = Math.max(0, Number(takenRuns) || 0);
  const labels = {
    wide: "Wd",
    noBall: "Nb",
    bye: "B",
    legBye: "Lb"
  };
  const names = {
    wide: "wide",
    noBall: "no ball",
    bye: "bye",
    legBye: "leg bye"
  };
  const totalRuns = kind === "wide" || kind === "noBall" ? completedRuns + 1 : completedRuns;
  const extraRuns = kind === "noBall" ? 1 : totalRuns;
  const batsmanRuns = kind === "noBall" ? completedRuns : 0;
  const bowlerRuns = kind === "bye" || kind === "legBye" ? 0 : totalRuns;
  const label = kind === "wide" || kind === "noBall"
    ? `${labels[kind]}${completedRuns ? `+${completedRuns}` : ""}`
    : `${labels[kind]} ${completedRuns}`;

  addDelivery({
    label,
    note: extraNote(names[kind], completedRuns, totalRuns),
    teamRuns: totalRuns,
    extraRuns,
    bowlerRuns,
    legal,
    batsmanRuns,
    rotationRuns: completedRuns,
    type: kind
  });
}

function takeWicket() {
  const innings = currentInnings();
  if (!canScore(innings)) return;

  if (innings.freeHit) {
    addDelivery({
      label: "FH",
      note: `${striker(innings).name} survived the free hit`,
      teamRuns: 0,
      extraRuns: 0,
      bowlerRuns: 0,
      legal: true,
      batsmanRuns: 0,
      rotationRuns: 0,
      freeHitProtected: true,
      type: "run"
    });
    return;
  }

  addDelivery({
    label: "W",
    note: `${striker(innings).name} out`,
    teamRuns: 0,
    extraRuns: 0,
    bowlerRuns: 0,
    legal: true,
    batsmanRuns: 0,
    rotationRuns: 0,
    wicket: true,
    bowlerWicket: true,
    type: "wicket"
  });
}

function addDelivery(delivery) {
  const innings = currentInnings();
  if (!canScore(innings)) return;
  pushHistory();

  const batter = striker(innings);
  const bowler = currentBowler(innings);
  const previousFreeHit = innings.freeHit;
  const wasLegal = Boolean(delivery.legal);
  const teamRuns = Number(delivery.teamRuns) || 0;
  const extraRuns = Number(delivery.extraRuns) || 0;
  const bowlerRuns = Number(delivery.bowlerRuns) || 0;

  innings.runs += teamRuns;

  if (innings.extras[delivery.type] !== undefined) {
    innings.extras[delivery.type] += extraRuns;
  }

  if (wasLegal) {
    innings.balls += 1;
    batter.balls += 1;
    if (bowler) bowler.balls += 1;
  }

  if (bowler) {
    bowler.runsConceded += bowlerRuns;
  }

  if (delivery.batsmanRuns) {
    batter.runs += delivery.batsmanRuns;
    if (delivery.batsmanRuns === 4) batter.fours += 1;
    if (delivery.batsmanRuns === 6) batter.sixes += 1;
  }

  if (delivery.wicket && !previousFreeHit) {
    if (bowler && delivery.bowlerWicket) bowler.wickets += 1;
    recordWicket(innings, batter);
  } else if (delivery.rotationRuns % 2 === 1) {
    swapStrike(innings);
  }

  if (wasLegal && innings.balls % 6 === 0) {
    swapStrike(innings);
  }

  if (delivery.type === "noBall") {
    innings.freeHit = true;
  } else if (wasLegal) {
    innings.freeHit = false;
  }

  innings.deliveries.unshift({
    over: wasLegal ? formatOvers(innings.balls) : `${Math.floor(innings.balls / 6)}.${(innings.balls % 6) + 1}*`,
    label: delivery.label,
    note: deliveryNote(delivery),
    runs: teamRuns,
    legal: wasLegal,
    bowler: bowler?.name || "",
    batter: batter?.name || "",
    freeHit: previousFreeHit
  });

  updateCompletion(innings);
  if (wasLegal && innings.balls % 6 === 0 && !innings.complete && bowler) {
    completeOver(innings, bowler.id);
  }
  saveAndRender();
}

function recordWicket(innings, batter) {
  innings.wickets += 1;
  batter.out = true;
  innings.fallOfWickets.push({
    wicket: innings.wickets,
    score: innings.runs,
    over: formatOvers(innings.balls),
    batter: batter.name
  });

  if (innings.wickets >= 10) return;

  const next = createBatter(innings.nextBatter, `Batter ${innings.nextBatter}`);
  innings.nextBatter += 1;
  innings.batsmen.push(next);
  innings.strikerId = next.id;
}

function manualSwapStrike() {
  const innings = currentInnings();
  if (scoringClosed(innings)) return;
  pushHistory();
  swapStrike(innings);
  saveAndRender();
}

function updateBatterName(id, value) {
  const innings = currentInnings();
  const batter = innings.batsmen.find((item) => item.id === id);
  if (!batter) return;

  pushHistory();
  batter.name = cleanName(value, `Batter ${id}`);
  saveAndRender();
}

function addBowler() {
  const innings = currentInnings();
  if (scoringClosed(innings)) return;

  pushHistory();
  const bowler = createBowler(innings.nextBowler, `Bowler ${innings.nextBowler}`);
  innings.nextBowler += 1;
  innings.bowlers.push(bowler);
  innings.currentBowlerId = bowler.id;
  innings.mustChangeBowler = false;
  saveAndRender();
}

function setCurrentBowler(id) {
  const innings = currentInnings();
  if (scoringClosed(innings) || innings.currentBowlerId === id) return;
  if (!innings.bowlers.some((bowler) => bowler.id === id)) return;
  if (!bowlerCanStartOver(innings, id)) return;

  pushHistory();
  innings.currentBowlerId = id;
  innings.mustChangeBowler = false;
  saveAndRender();
}

function updateBowlerName(id, value) {
  const innings = currentInnings();
  const bowler = innings.bowlers.find((item) => item.id === id);
  if (!bowler) return;

  pushHistory();
  bowler.name = cleanName(value, `Bowler ${id}`);
  saveAndRender();
}

function swapStrike(innings) {
  const previousStriker = innings.strikerId;
  innings.strikerId = innings.nonStrikerId;
  innings.nonStrikerId = previousStriker;
}

function endInnings() {
  const innings = currentInnings();
  if (innings.complete && state.inningsIndex === 1) return;

  pushHistory();
  innings.complete = true;
  innings.completionReason = innings.completionReason || "Innings closed";

  if (state.inningsIndex === 0) {
    createSecondInnings();
  }

  saveAndRender();
}

function startNextInnings() {
  const innings = currentInnings();
  if (state.inningsIndex !== 0 || !innings.complete) return;

  pushHistory();
  createSecondInnings();
  saveAndRender();
}

function createSecondInnings() {
  if (state.innings[1]) {
    state.inningsIndex = 1;
    return;
  }

  const first = state.innings[0];
  state.innings.push(createInnings(first.bowlingTeam, first.battingTeam));
  state.inningsIndex = 1;
}

function updateCompletion(innings) {
  if (state.inningsIndex === 1 && innings.runs >= target()) {
    innings.complete = true;
    innings.completionReason = "Target reached";
    return;
  }

  if (innings.wickets >= 10) {
    innings.complete = true;
    innings.completionReason = "All out";
    return;
  }

  if (innings.balls >= state.match.overs * 6) {
    innings.complete = true;
    innings.completionReason = "Overs complete";
  }
}

function currentInnings() {
  return state.innings[state.inningsIndex];
}

function striker(innings) {
  return innings.batsmen.find((batter) => batter.id === innings.strikerId);
}

function nonStriker(innings) {
  return innings.batsmen.find((batter) => batter.id === innings.nonStrikerId);
}

function currentBowler(innings) {
  return innings.bowlers.find((bowler) => bowler.id === innings.currentBowlerId);
}

function canScore(innings) {
  return !scoringClosed(innings) && !innings.mustChangeBowler;
}

function scoringClosed(innings) {
  return innings.complete;
}

function bowlerCanStartOver(innings, bowlerId) {
  return !(innings.balls > 0 && innings.lastOverBowlerId === bowlerId && !innings.complete);
}

function completeOver(innings, bowlerId) {
  innings.lastOverBowlerId = bowlerId;
  const nextBowler = innings.bowlers.find((bowler) => bowler.id !== bowlerId);

  if (nextBowler) {
    innings.currentBowlerId = nextBowler.id;
    innings.mustChangeBowler = false;
    return;
  }

  innings.mustChangeBowler = true;
}

function target() {
  if (!state.innings[0]) return null;
  return state.innings[0].runs + 1;
}

function formatOvers(balls) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function runRate(innings) {
  if (!innings.balls) return "0.00";
  return (innings.runs / (innings.balls / 6)).toFixed(2);
}

function requiredRunRate(innings) {
  if (state.inningsIndex !== 1 || innings.complete) return "-";
  const needed = target() - innings.runs;
  const remaining = ballsRemaining(innings);
  if (needed <= 0) return "0.00";
  if (!remaining) return "N/A";
  return (needed / (remaining / 6)).toFixed(2);
}

function strikeRate(batter) {
  if (!batter.balls) return "0.0";
  return ((batter.runs / batter.balls) * 100).toFixed(1);
}

function bowlingAverage(bowler) {
  if (!bowler.wickets) return "-";
  return (bowler.runsConceded / bowler.wickets).toFixed(2);
}

function economyRate(bowler) {
  if (!bowler.balls) return "0.00";
  return (bowler.runsConceded / (bowler.balls / 6)).toFixed(2);
}

function extraNote(name, completedRuns, totalRuns) {
  if (name === "wide") {
    return completedRuns ? `Wide plus ${completedRuns} run${completedRuns === 1 ? "" : "s"}` : "Wide";
  }

  if (name === "no ball") {
    return completedRuns ? `No ball plus ${completedRuns} bat run${completedRuns === 1 ? "" : "s"}` : "No ball";
  }

  return `${totalRuns} ${name}${totalRuns === 1 ? "" : "s"}`;
}

function deliveryNote(delivery) {
  if (delivery.freeHitProtected) return `${delivery.note}; wicket does not count`;
  if (delivery.type === "noBall") return `${delivery.note}; free hit next`;
  return delivery.note;
}

function projectedScore(innings) {
  if (!innings.balls) return 0;
  return Math.round(Number(runRate(innings)) * state.match.overs);
}

function ballsRemaining(innings) {
  return Math.max(0, state.match.overs * 6 - innings.balls);
}

function statusText(innings) {
  if (innings.mustChangeBowler) {
    return "Over complete. Select or add a new bowler before the next ball.";
  }

  const freeHitPrefix = innings.freeHit ? "Free hit active. " : "";

  if (state.inningsIndex === 0) {
    if (innings.complete) return `${innings.completionReason}. ${innings.bowlingTeam} need ${innings.runs + 1}.`;
    return `${freeHitPrefix}Projected ${projectedScore(innings)} from ${state.match.overs} overs.`;
  }

  const chaseTarget = target();
  if (innings.runs >= chaseTarget) {
    return `${innings.battingTeam} won by ${10 - innings.wickets} wicket${10 - innings.wickets === 1 ? "" : "s"}.`;
  }

  const needed = chaseTarget - innings.runs;
  if (innings.complete) {
    const margin = needed - 1;
    return `${innings.bowlingTeam} won by ${margin} run${margin === 1 ? "" : "s"}.`;
  }

  return `${freeHitPrefix}${needed} needed from ${ballsRemaining(innings)} balls. RRR ${requiredRunRate(innings)}.`;
}

function render() {
  const innings = currentInnings();
  const chaseTarget = state.inningsIndex === 1 ? target() : null;
  const activeBatters = [striker(innings), nonStriker(innings)].filter(Boolean);
  const activeBowler = currentBowler(innings);
  const closed = scoringClosed(innings);

  elements.matchTitle.textContent = `${state.match.teamA} vs ${state.match.teamB}`;
  elements.inningsLabel.textContent = `${innings.battingTeam} batting`;
  elements.scoreText.textContent = `${innings.runs}/${innings.wickets}`;
  elements.oversText.textContent = `${formatOvers(innings.balls)} / ${state.match.overs}`;
  elements.runRate.textContent = runRate(innings);
  elements.requiredRateMeta.innerHTML = `RRR <strong>${requiredRunRate(innings)}</strong>`;
  elements.targetMeta.innerHTML = `Target <strong>${chaseTarget || "-"}</strong>`;
  elements.freeHitMeta.hidden = !innings.freeHit;
  elements.statusLine.textContent = statusText(innings);

  elements.teamAInput.value = state.match.teamA;
  elements.teamBInput.value = state.match.teamB;
  elements.oversInput.value = state.match.overs;
  elements.batFirstInput.value = state.match.battingFirst;

  elements.battersList.innerHTML = activeBatters.map((batter) => batterRow(batter, batter.id === innings.strikerId)).join("");
  elements.battingCard.innerHTML = scorecardHeader(["Batter", "R", "B", "SR", "4s", "6s", "Status"]) +
    innings.batsmen.map((batter) => battingCardRow(batter, innings)).join("");
  elements.bowlerSelect.innerHTML = innings.bowlers.map((bowler) =>
    `<option value="${bowler.id}" ${bowlerCanStartOver(innings, bowler.id) ? "" : "disabled"}>${escapeHtml(bowler.name)}</option>`
  ).join("");
  elements.bowlerSelect.value = String(activeBowler?.id || "");
  elements.bowlerSelect.disabled = closed;
  elements.bowlingCard.innerHTML = scorecardHeader(["Bowler", "O", "R", "W", "Avg", "Econ"]) +
    innings.bowlers.map((bowler) => bowlingCardRow(bowler, bowler.id === innings.currentBowlerId)).join("");
  elements.inningsSummary.innerHTML = state.innings.map(summaryRow).join("");
  elements.matchReport.innerHTML = matchReport();
  elements.deliveryLog.innerHTML = innings.deliveries.length
    ? innings.deliveries.map(deliveryRow).join("")
    : `<li><span class="ball-over">0.0</span><span class="ball-note">No balls yet</span><span class="ball-label">-</span></li>`;

  elements.wideTotal.textContent = innings.extras.wide;
  elements.noBallTotal.textContent = innings.extras.noBall;
  elements.byeTotal.textContent = innings.extras.bye;
  elements.legByeTotal.textContent = innings.extras.legBye;

  document.querySelectorAll("[data-score-control]").forEach((control) => {
    control.disabled = !canScore(innings);
  });

  const undoButton = document.querySelector('[data-action="undo"]');
  undoButton.disabled = state.history.length === 0;

  const addBowlerButton = document.querySelector('[data-action="add-bowler"]');
  addBowlerButton.disabled = closed;

  const startNextButton = document.querySelector('[data-action="start-next-innings"]');
  startNextButton.disabled = state.inningsIndex !== 0 || !state.innings[0].complete || Boolean(state.innings[1]);

  const endButton = document.querySelector('[data-action="end-innings"]');
  endButton.disabled = state.inningsIndex === 1 && innings.complete;
}

function batterRow(batter, isStriker) {
  return `
    <div class="batter-row">
      <div class="batter-name">
        <input class="batter-input" aria-label="Batter name" data-batter-name="${batter.id}" value="${escapeAttribute(batter.name)}" />
        ${isStriker ? '<span class="strike-tag">On strike</span>' : ""}
      </div>
      <div class="batter-score">
        <strong>${batter.runs}</strong>
        <span>${batter.balls} balls, SR ${strikeRate(batter)}</span>
      </div>
    </div>
  `;
}

function scorecardHeader(labels) {
  return `
    <div class="scorecard-row scorecard-head">
      ${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
    </div>
  `;
}

function battingCardRow(batter, innings) {
  const status = batter.out ? "out" : batter.id === innings.strikerId ? "striker" : batter.id === innings.nonStrikerId ? "not out" : "yet to bat";
  return `
    <div class="scorecard-row batting-row">
      <span><input class="card-name-input" aria-label="Batter name" data-batter-name="${batter.id}" value="${escapeAttribute(batter.name)}" /></span>
      <strong>${batter.runs}</strong>
      <span>${batter.balls}</span>
      <span>${strikeRate(batter)}</span>
      <span>${batter.fours}</span>
      <span>${batter.sixes}</span>
      <span class="status-pill">${status}</span>
    </div>
  `;
}

function bowlingCardRow(bowler, isCurrent) {
  return `
    <div class="scorecard-row bowling-row">
      <span>
        <input class="card-name-input" aria-label="Bowler name" data-bowler-name="${bowler.id}" value="${escapeAttribute(bowler.name)}" />
        ${isCurrent ? '<span class="strike-tag">Bowling</span>' : ""}
      </span>
      <span>${formatOvers(bowler.balls)}</span>
      <strong>${bowler.runsConceded}</strong>
      <span>${bowler.wickets}</span>
      <span>${bowlingAverage(bowler)}</span>
      <span>${economyRate(bowler)}</span>
    </div>
  `;
}

function summaryRow(innings, index) {
  const label = index === 0 ? "1st innings" : "2nd innings";
  return `
    <div class="summary-item">
      <strong>${label}: ${escapeHtml(innings.battingTeam)}</strong>
      <span class="summary-score">${innings.runs}/${innings.wickets} (${formatOvers(innings.balls)})</span>
    </div>
  `;
}

function deliveryRow(delivery) {
  return `
    <li>
      <span class="ball-over">${delivery.over}</span>
      <span class="ball-note">${escapeHtml(delivery.note)}</span>
      <span class="ball-label">${escapeHtml(delivery.label)}</span>
    </li>
  `;
}

function matchReport() {
  return `
    <div class="report-summary">
      <div><span>Match</span><strong>${escapeHtml(state.match.teamA)} vs ${escapeHtml(state.match.teamB)}</strong></div>
      <div><span>Format</span><strong>${state.match.overs} overs</strong></div>
      <div><span>Bat first</span><strong>${escapeHtml(state.match.battingFirst === "teamA" ? state.match.teamA : state.match.teamB)}</strong></div>
      <div><span>Result</span><strong>${escapeHtml(matchResultText())}</strong></div>
    </div>
    ${state.innings.map(reportInnings).join("")}
  `;
}

function reportInnings(innings, index) {
  const extras = totalExtras(innings);

  return `
    <section class="report-innings">
      <h3>${index + 1}${index === 0 ? "st" : "nd"} innings: ${escapeHtml(innings.battingTeam)} ${innings.runs}/${innings.wickets} (${formatOvers(innings.balls)})</h3>
      <div class="report-summary compact">
        <div><span>Run rate</span><strong>${runRate(innings)}</strong></div>
        <div><span>Extras</span><strong>${extras} (${extrasBreakdown(innings)})</strong></div>
        <div><span>Bowling team</span><strong>${escapeHtml(innings.bowlingTeam)}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(innings.completionReason || "In progress")}</strong></div>
      </div>
      ${reportTable("Batting", ["Batter", "Status", "R", "B", "SR", "4s", "6s"], innings.batsmen.map((batter) => [
        batter.name,
        batterStatus(batter, innings),
        batter.runs,
        batter.balls,
        strikeRate(batter),
        batter.fours,
        batter.sixes
      ]))}
      ${reportTable("Bowling", ["Bowler", "O", "R", "W", "Avg", "Econ"], innings.bowlers.map((bowler) => [
        bowler.name,
        formatOvers(bowler.balls),
        bowler.runsConceded,
        bowler.wickets,
        bowlingAverage(bowler),
        economyRate(bowler)
      ]))}
      ${reportTable("Fall Of Wickets", ["Wicket", "Score", "Over", "Batter"], innings.fallOfWickets.length
        ? innings.fallOfWickets.map((item) => [item.wicket, item.score, item.over, item.batter])
        : [["-", "-", "-", "No wickets"]])}
    </section>
  `;
}

function reportTable(title, headers, rows) {
  return `
    <div class="report-table-wrap">
      <h4>${escapeHtml(title)}</h4>
      <table class="report-table">
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function downloadMatchReportPdf() {
  const pdf = buildPdf(matchReportLines());
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${safeFileName(state.match.teamA)}-vs-${safeFileName(state.match.teamB)}-match-report.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function matchReportLines() {
  const lines = [
    "Cricket Match Report",
    "",
    `Match: ${state.match.teamA} vs ${state.match.teamB}`,
    `Format: ${state.match.overs} overs`,
    `Bat first: ${state.match.battingFirst === "teamA" ? state.match.teamA : state.match.teamB}`,
    `Result: ${matchResultText()}`,
    ""
  ];

  state.innings.forEach((innings, index) => {
    lines.push(`${index + 1}${index === 0 ? "st" : "nd"} innings: ${innings.battingTeam} ${innings.runs}/${innings.wickets} (${formatOvers(innings.balls)})`);
    lines.push(`Bowling team: ${innings.bowlingTeam}`);
    lines.push(`Run rate: ${runRate(innings)}`);
    lines.push(`Extras: ${totalExtras(innings)} (${extrasBreakdown(innings)})`);
    lines.push(`Status: ${innings.completionReason || "In progress"}`);
    lines.push("");

    lines.push("Batting");
    lines.push("Batter | Status | R | B | SR | 4s | 6s");
    innings.batsmen.forEach((batter) => {
      lines.push(`${batter.name} | ${batterStatus(batter, innings)} | ${batter.runs} | ${batter.balls} | ${strikeRate(batter)} | ${batter.fours} | ${batter.sixes}`);
    });
    lines.push("");

    lines.push("Bowling");
    lines.push("Bowler | O | R | W | Avg | Econ");
    innings.bowlers.forEach((bowler) => {
      lines.push(`${bowler.name} | ${formatOvers(bowler.balls)} | ${bowler.runsConceded} | ${bowler.wickets} | ${bowlingAverage(bowler)} | ${economyRate(bowler)}`);
    });
    lines.push("");

    lines.push("Fall Of Wickets");
    if (innings.fallOfWickets.length) {
      innings.fallOfWickets.forEach((item) => {
        lines.push(`${item.wicket}. ${item.score}/${item.wicket} at ${item.over} - ${item.batter}`);
      });
    } else {
      lines.push("No wickets");
    }
    lines.push("");
  });

  return lines;
}

function buildPdf(lines) {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const top = pageHeight - margin;
  const lineHeight = 14;
  const maxLines = Math.floor((pageHeight - margin * 2) / lineHeight);
  const wrappedLines = lines.flatMap((line) => wrapPdfLine(line, 92));
  const pages = [];

  for (let index = 0; index < wrappedLines.length; index += maxLines) {
    pages.push(wrappedLines.slice(index, index + maxLines));
  }

  if (!pages.length) pages.push(["Cricket Match Report"]);

  const objects = [];
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const kids = [];
  let objectNumber = 4;
  pages.forEach((pageLines) => {
    const pageObject = objectNumber;
    const contentObject = objectNumber + 1;
    kids.push(`${pageObject} 0 R`);
    objects[pageObject - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;
    const stream = pdfPageStream(pageLines, margin, top, lineHeight);
    objects[contentObject - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objectNumber += 2;
  });

  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

function pdfPageStream(lines, margin, top, lineHeight) {
  const content = ["BT", `/F1 10 Tf`, `${margin} ${top} Td`];
  lines.forEach((line, index) => {
    if (index > 0) content.push(`0 -${lineHeight} Td`);
    content.push(`(${escapePdfText(line)}) Tj`);
  });
  content.push("ET");
  return content.join("\n");
}

function wrapPdfLine(value, maxLength) {
  const text = pdfSafeText(value);
  if (!text) return [""];

  const words = text.split(" ");
  const lines = [];
  let line = "";

  words.forEach((word) => {
    if (!line) {
      line = word;
      return;
    }

    if (`${line} ${word}`.length <= maxLength) {
      line = `${line} ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  });

  if (line) lines.push(line);
  return lines;
}

function escapePdfText(value) {
  return pdfSafeText(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function pdfSafeText(value) {
  return String(value)
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFileName(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "team";
}

function matchResultText() {
  const first = state.innings[0];
  const second = state.innings[1];

  if (!second) {
    return first.complete
      ? `${first.bowlingTeam} need ${first.runs + 1} to win`
      : `${first.battingTeam} innings in progress`;
  }

  const chaseTarget = first.runs + 1;
  if (second.runs >= chaseTarget) {
    const wicketsLeft = 10 - second.wickets;
    return `${second.battingTeam} won by ${wicketsLeft} wicket${wicketsLeft === 1 ? "" : "s"}`;
  }

  if (second.complete) {
    const margin = chaseTarget - second.runs - 1;
    return `${second.bowlingTeam} won by ${margin} run${margin === 1 ? "" : "s"}`;
  }

  return `${second.battingTeam} need ${chaseTarget - second.runs} from ${ballsRemaining(second)} balls`;
}

function batterStatus(batter, innings) {
  if (batter.out) return "out";
  if (batter.id === innings.strikerId) return "striker";
  if (batter.id === innings.nonStrikerId) return "not out";
  return "yet to bat";
}

function totalExtras(innings) {
  return innings.extras.wide + innings.extras.noBall + innings.extras.bye + innings.extras.legBye;
}

function extrasBreakdown(innings) {
  return `wd ${innings.extras.wide}, nb ${innings.extras.noBall}, b ${innings.extras.bye}, lb ${innings.extras.legBye}`;
}

function saveAndRender() {
  saveState();
  render();
}

function cleanName(value, fallback) {
  const name = String(value || "").trim();
  return name || fallback;
}

function clampOvers(value) {
  const overs = Math.round(Number(value));
  if (!Number.isFinite(overs)) return 20;
  return Math.min(50, Math.max(1, overs));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
