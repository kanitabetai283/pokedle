const DATA_URL = "https://raw.githubusercontent.com/kotofurumiya/pokemon_data/master/data/pokemon_data.json";
const CACHE_KEY = "pokemonWordleDataV1";
const DAILY_KEY = "pokemonWordleDailyV1";
const STATS_KEY = "pokemonWordleStatsV1";
const MAX_ATTEMPTS = 10;

let allPokemon = [];
let candidates = [];
let answer = "";
let guesses = [];
let mode = "daily";
let genFrom = 1, genTo = 4;
let keyboardState = {};
let gameFinished = false;

const $ = id => document.getElementById(id);

const normalKana = [
  "ア","カ","サ","タ","ナ","ハ","マ","ヤ","ラ","ワ",
  "イ","キ","シ","チ","ニ","ヒ","ミ","ユ","リ","ヲ",
  "ウ","ク","ス","ツ","ヌ","フ","ム","ヨ","ル","ン",
  "エ","ケ","セ","テ","ネ","ヘ","メ","","レ","",
  "オ","コ","ソ","ト","ノ","ホ","モ","","ロ",""
];
const extendedKana = [
  "ァ","ガ","ザ","ダ","バ","パ","ヴ","ャ","ュ","ョ",
  "ィ","ギ","ジ","ヂ","ビ","ピ","","","","",
  "ゥ","グ","ズ","ヅ","ブ","プ","","","","",
  "ェ","ゲ","ゼ","デ","ベ","ペ","","","","",
  "ォ","ゴ","ゾ","ド","ボ","ポ","ッ","ー","2","Z"
];

function chars(s) { return Array.from(s); }
function charCount(s) { return chars(s).length; }

function normalizeName(s) {
  return s.trim().replace(/\s+/g, "").toUpperCase();
}

function generationOf(no) {
  if (no <= 151) return 1;
  if (no <= 251) return 2;
  if (no <= 386) return 3;
  if (no <= 493) return 4;
  if (no <= 649) return 5;
  if (no <= 721) return 6;
  if (no <= 809) return 7;
  if (no <= 905) return 8;
  return 9;
}

function buildDataset(raw) {
  const seen = new Set();
  return raw
    .filter(p => p.form === "" && !p.isMegaEvolution)
    .map(p => ({ name: p.name, no: Number(p.no), generation: generationOf(Number(p.no)) }))
    .filter(p => {
      if (!p.name || seen.has(p.name)) return false;
      seen.add(p.name);
      return charCount(p.name) === 5;
    });
}

async function loadData() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try { allPokemon = JSON.parse(cached); return; } catch (_) {}
  }
  $("gameStatus").textContent = "ポケモンデータを初回取得中…";
  const res = await fetch(DATA_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error("データ取得失敗");
  const raw = await res.json();
  allPokemon = buildDataset(raw);
  localStorage.setItem(CACHE_KEY, JSON.stringify(allPokemon));
}

function seedHash(str) {
  let h = 2166136261;
  for (const c of str) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function dailyAnswer() {
  const pool = allPokemon.filter(p => p.generation <= 4);
  const key = new Date().toLocaleDateString("ja-JP", {timeZone:"Asia/Tokyo"});
  return pool[seedHash(key) % pool.length].name;
}

function randomAnswer(from, to) {
  const pool = allPokemon.filter(p => p.generation >= from && p.generation <= to);
  if (!pool.length) return "";
  return pool[Math.floor(Math.random() * pool.length)].name;
}

function setMessage(msg, ok=false) {
  $("message").textContent = msg;
  $("message").style.color = ok ? "#027a48" : "#b42318";
}

function compareGuess(guess, target) {
  const g = chars(guess), t = chars(target);
  const result = Array(5).fill("absent");
  const remaining = new Map();

  // Exact matches first.
  for (let i=0;i<5;i++) {
    if (g[i] === t[i]) result[i] = "correct";
    else remaining.set(t[i], (remaining.get(t[i]) || 0) + 1);
  }
  // Then misplaced matches.
  for (let i=0;i<5;i++) {
    if (result[i] === "correct") continue;
    const n = remaining.get(g[i]) || 0;
    if (n > 0) {
      result[i] = "present";
      remaining.set(g[i], n - 1);
    }
  }
  return result;
}

function updateKeyboard(guess, result) {
  const priority = { unused:0, absent:1, present:2, correct:3 };
  for (let i=0;i<guess.length;i++) {
    const c = guess[i];
    const old = keyboardState[c] || "unused";
    if (priority[result[i]] > priority[old]) keyboardState[c] = result[i];
  }
  renderKeyboard();
}

function makeKeyboard(containerId, letters) {
  const el = $(containerId);
  el.innerHTML = "";
  for (const c of letters) {
    const b = document.createElement("div");
    if (!c) {
      b.className = "kana-key empty";
      b.setAttribute("aria-hidden", "true");
    } else {
      b.className = "kana-key " + (keyboardState[c] || "unused");
      b.textContent = c;
    }
    el.appendChild(b);
  }
}

function renderKeyboard() {
  makeKeyboard("kanaNormal", normalKana);
  makeKeyboard("kanaExtended", extendedKana);
}

function renderBoard() {
  const board = $("board");
  board.innerHTML = "";
  for (let r=0;r<MAX_ATTEMPTS;r++) {
    const row = document.createElement("div");
    row.className = "row";
    if (guesses[r]) {
      for (let i=0;i<5;i++) {
        const tile = document.createElement("div");
        tile.className = "tile " + guesses[r].result[i];
        tile.textContent = chars(guesses[r].name)[i] || "";
        row.appendChild(tile);
      }
    } else {
      for (let i=0;i<5;i++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        row.appendChild(tile);
      }
    }
    board.appendChild(row);
  }
  $("attemptStatus").textContent = `${guesses.length} / ${MAX_ATTEMPTS}`;
}

function saveDailyProgress() {
  if (mode !== "daily") return;
  const key = new Date().toLocaleDateString("ja-JP", {timeZone:"Asia/Tokyo"});
  localStorage.setItem(DAILY_KEY, JSON.stringify({date:key, answer, guesses, keyboardState, finished: gameFinished}));
}

function restoreDailyProgress() {
  const key = new Date().toLocaleDateString("ja-JP", {timeZone:"Asia/Tokyo"});
  try {
    const saved = JSON.parse(localStorage.getItem(DAILY_KEY) || "null");
    if (saved && saved.date === key) {
      answer = saved.answer;
      guesses = saved.guesses || [];
      keyboardState = saved.keyboardState || {};
      gameFinished = !!saved.finished;
      return true;
    }
  } catch (_) {}
  return false;
}

function updateStats(win, attempts) {
  const s = JSON.parse(localStorage.getItem(STATS_KEY) || '{"played":0,"wins":0,"currentStreak":0,"bestStreak":0,"sumAttempts":0,"distribution":{}}');
  s.played++;
  if (win) {
    s.wins++;
    s.currentStreak++;
    s.bestStreak = Math.max(s.bestStreak, s.currentStreak);
    s.sumAttempts += attempts;
    s.distribution[attempts] = (s.distribution[attempts] || 0) + 1;
  } else {
    s.currentStreak = 0;
  }
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

function showResult(win) {
  $("result").classList.remove("hidden");
  $("resultTitle").textContent = win ? "🎉 正解！" : "😢 ゲームオーバー";
  $("resultAnswer").textContent = answer;
  $("resultNext").textContent = mode === "daily" ? "今日の問題を確認" : "次の問題";
  $("resultNext").onclick = () => {
    if (mode === "daily") {
      $("result").scrollIntoView({behavior:"smooth"});
    } else {
      startGame("endless");
      window.scrollTo({top:0, behavior:"smooth"});
    }
  };
}

function finish(win) {
  $("guessInput").disabled = true;
  $("guessBtn").disabled = true;
  $("surrenderBtn").disabled = true;
  gameFinished = true;
  updateStats(win, guesses.length);
  saveDailyProgress();
  showResult(win);
}

function surrender() {
  if (!answer || guesses.length >= MAX_ATTEMPTS || $("guessInput").disabled) return;
  setMessage("降参しました。");
  finish(false);
}

function submitGuess() {
  if (!answer || guesses.length >= MAX_ATTEMPTS) return;
  const guess = normalizeName($("guessInput").value);
  setMessage("");

  if (charCount(guess) !== 5) {
    setMessage("5文字のポケモン名を入力してください。");
    return;
  }

  const known = allPokemon.some(p => p.name === guess);
  if (!known) {
    setMessage("そのポケモンは存在しません");
    return;
  }

  const result = compareGuess(guess, answer);
  guesses.push({name:guess, result});
  updateKeyboard(guess, result);
  renderBoard();
  $("guessInput").value = "";
  saveDailyProgress();

  if (guess === answer) finish(true);
  else if (guesses.length >= MAX_ATTEMPTS) finish(false);
  else $("guessInput").focus();
}

function populateGenerations() {
  for (let i=1;i<=10;i++) {
    $("genFrom").insertAdjacentHTML("beforeend", `<option value="${i}">${i}</option>`);
    $("genTo").insertAdjacentHTML("beforeend", `<option value="${i}">${i}</option>`);
  }
  $("genFrom").value = "1";
  $("genTo").value = "10";
}

function startGame(newMode=mode) {
  mode = newMode;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.mode === mode));
  $("settings").classList.toggle("hidden", mode !== "endless");
  $("result").classList.add("hidden");
  $("guessInput").disabled = false;
  $("guessBtn").disabled = false;
  $("surrenderBtn").disabled = false;
  guesses = [];
  keyboardState = {};
  gameFinished = false;
  setMessage("");
  if (mode === "daily") {
    answer = dailyAnswer();
    if (!restoreDailyProgress()) {
      guesses = []; keyboardState = {}; gameFinished = false;
    }
    $("gameStatus").textContent = "第1～第4世代・今日の問題";
  } else {
    genFrom = Number($("genFrom").value);
    genTo = Number($("genTo").value);
    if (genFrom > genTo) [genFrom, genTo] = [genTo, genFrom];
    $("genFrom").value = genFrom;
    $("genTo").value = genTo;
    answer = randomAnswer(genFrom, genTo);
    $("gameStatus").textContent = `第${genFrom}～第${genTo}世代・エンドレス`;
  }
  renderBoard();
  renderKeyboard();
  if (gameFinished || guesses.length >= MAX_ATTEMPTS || guesses.some(g => g.name === answer)) {
    $("guessInput").disabled = true;
    $("guessBtn").disabled = true;
    $("surrenderBtn").disabled = true;
    $("result").classList.remove("hidden");
    $("resultTitle").textContent = guesses.some(g => g.name === answer) ? "🎉 正解！" : "😢 ゲームオーバー";
    $("resultAnswer").textContent = answer;
  }
  $("guessInput").focus();
}

function showStats() {
  const s = JSON.parse(localStorage.getItem(STATS_KEY) || '{"played":0,"wins":0,"currentStreak":0,"bestStreak":0,"sumAttempts":0,"distribution":{}}');
  const rate = s.played ? Math.round(s.wins / s.played * 100) : 0;
  const avg = s.wins ? (s.sumAttempts / s.wins).toFixed(1) : "-";
  $("statsContent").innerHTML = `
    <div class="stat-grid">
      <div class="stat">プレイ数<b>${s.played}</b></div>
      <div class="stat">正解数<b>${s.wins}</b></div>
      <div class="stat">正解率<b>${rate}%</b></div>
      <div class="stat">平均回答数<b>${avg}</b></div>
      <div class="stat">現在の連勝<b>${s.currentStreak}</b></div>
      <div class="stat">最高連勝<b>${s.bestStreak}</b></div>
    </div>`;
  $("statsDialog").showModal();
}

document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  if (t.dataset.mode === "daily") startGame("daily");
  else startGame("endless");
}));
$("guessBtn").addEventListener("click", submitGuess);
$("surrenderBtn").addEventListener("click", surrender);
$("guessInput").addEventListener("keydown", e => { if (e.key === "Enter") submitGuess(); });
$("newGameBtn").addEventListener("click", () => startGame("endless"));
$("genFrom").addEventListener("change", () => { if (mode==="endless") startGame("endless"); });
$("genTo").addEventListener("change", () => { if (mode==="endless") startGame("endless"); });
$("statsBtn").addEventListener("click", showStats);
$("closeStats").addEventListener("click", () => $("statsDialog").close());

(async function init() {
  populateGenerations();
  renderKeyboard();
  try {
    await loadData();
    $("gameStatus").textContent = `データ準備完了（5文字候補 ${allPokemon.length}匹）`;
    startGame("daily");
  } catch (e) {
    $("gameStatus").textContent = "データ取得に失敗しました";
    setMessage("初回起動時はインターネット接続が必要です。ページを再読み込みしてください。");
    console.error(e);
  }
})();
