/* =========================
   /script.js
   Got Rhythm
   - audio/kick1.mp3, audio/snare1.mp3
   - required for metronome: audio/metronomehigh.mp3, audio/metronomelow.mp3
   - preserves iframe sizing + scroll forwarding
   ========================= */
(() => {
  "use strict";

  const AUDIO_DIR = "audio";

  // ---------------- Tunables ----------------
  const SCHED_AHEAD_SEC = 0.14;
  const SCHED_TICK_MS = 25;

  const CAPTURE_EARLY_BEATS = 0.5;
  const CAPTURE_LATE_BEATS = 0.5;

  const SCORING = {
    MATCH_MAX_MS: 180,
    TIER_5_MS: 55,
    TIER_4_MS: 90,
    TIER_3_MS: 125,
    TIER_2_MS: 165,
  };

  const BEAT_FLASH_MS = 120;

  const METRONOME_GAIN = 0.55;
  const DRUM_GAIN = 0.95;

  const SWING_FIRST_FRACTION = 2 / 3;

  // Prevent "click" after touch/pointer from double-firing
  const GHOST_CLICK_BLOCK_MS = 700;

  // ---------------- DOM ----------------
  const $ = (id) => document.getElementById(id);

  const beginBtn = $("beginBtn");
  const pauseBtn = $("pauseBtn");
  const stopBtn = $("stopBtn");
  const downloadScoreBtn = $("downloadScoreBtn");

  const difficultySel = $("difficultySel");
  const bpmRange = $("bpmRange");
  const bpmNum = $("bpmNum");

  const kickBtn = $("kickBtn");
  const snareBtn = $("snareBtn");

  const phaseTitle = $("phaseTitle");
  const phaseSub = $("phaseSub");
  const feedbackOut = $("feedbackOut");
  const scoreBar = $("scoreBar"); // kept for compatibility (hidden in CSS)
  const feedbackCard = $("feedbackCard");

  const avgScoreOut = $("avgScoreOut");
  const lastScoreOut = $("lastScoreOut");
  const roundsOut = $("roundsOut");
  const avgMsOut = $("avgMsOut");

  const beatDots = [$("beatDot1"), $("beatDot2"), $("beatDot3"), $("beatDot4")];

  const infoBtn = $("infoBtn");
  const infoModal = $("infoModal");
  const infoOk = $("infoOk");

  const summaryModal = $("summaryModal");
  const summaryBody = $("summaryBody");
  const summaryClose = $("summaryClose");
  const summaryDownload = $("summaryDownload");

  if (
    !beginBtn ||
    !pauseBtn ||
    !stopBtn ||
    !downloadScoreBtn ||
    !difficultySel ||
    !bpmRange ||
    !bpmNum ||
    !kickBtn ||
    !snareBtn ||
    !phaseTitle ||
    !phaseSub ||
    !feedbackOut ||
    !scoreBar ||
    !feedbackCard ||
    !avgScoreOut ||
    !lastScoreOut ||
    !roundsOut ||
    !avgMsOut ||
    beatDots.some((d) => !d) ||
    !summaryModal ||
    !summaryBody ||
    !summaryClose ||
    !summaryDownload
  ) {
    alert("UI mismatch: required elements missing. Ensure index.html matches script.js ids.");
    return;
  }

  // ---------------- iframe sizing (preserved) ----------------
  let lastHeight = 0;
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const height = Math.ceil(entry.contentRect.height);
      if (height !== lastHeight) {
        parent.postMessage({ iframeHeight: height }, "*");
        lastHeight = height;
      }
    }
  });
  ro.observe(document.documentElement);

  function postHeightNow() {
    try {
      const h = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      parent.postMessage({ iframeHeight: h }, "*");
    } catch {}
  }

  window.addEventListener("load", () => {
    postHeightNow();
    setTimeout(postHeightNow, 250);
    setTimeout(postHeightNow, 1000);
  });

  window.addEventListener("orientationchange", () => {
    setTimeout(postHeightNow, 100);
    setTimeout(postHeightNow, 500);
  });

  function enableScrollForwardingToParent() {
    const SCROLL_GAIN = 6.0;

    const isVerticallyScrollable = () =>
      document.documentElement.scrollHeight > window.innerHeight + 2;

    const isInteractiveTarget = (t) =>
      t instanceof Element && !!t.closest("button, a, input, select, textarea, label");

    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lockedMode = null;

    let lastMoveTs = 0;
    let vScrollTop = 0;

    window.addEventListener(
      "touchstart",
      (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        const t = e.target;

        lockedMode = null;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        lastY = startY;

        lastMoveTs = e.timeStamp || performance.now();
        vScrollTop = 0;

        if (isInteractiveTarget(t)) lockedMode = "x";
      },
      { passive: true }
    );

    window.addEventListener(
      "touchmove",
      (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        if (isVerticallyScrollable()) return;

        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;

        const dx = x - startX;
        const dy = y - startY;

        if (!lockedMode) {
          if (Math.abs(dy) > Math.abs(dx) + 4) lockedMode = "y";
          else if (Math.abs(dx) > Math.abs(dy) + 4) lockedMode = "x";
          else return;
        }
        if (lockedMode !== "y") return;

        const nowTs = e.timeStamp || performance.now();
        const dt = Math.max(8, nowTs - lastMoveTs);
        lastMoveTs = nowTs;

        const fingerStep = (y - lastY) * SCROLL_GAIN;
        lastY = y;

        const scrollTopDelta = -fingerStep;
        const instV = scrollTopDelta / dt;
        vScrollTop = vScrollTop * 0.75 + instV * 0.25;

        e.preventDefault();
        parent.postMessage({ scrollTopDelta }, "*");
      },
      { passive: false }
    );

    function endGesture() {
      if (lockedMode === "y" && Math.abs(vScrollTop) > 0.05) {
        const capped = Math.max(-5.5, Math.min(5.5, vScrollTop));
        parent.postMessage({ scrollTopVelocity: capped }, "*");
      }
      lockedMode = null;
      vScrollTop = 0;
    }

    window.addEventListener("touchend", endGesture, { passive: true });
    window.addEventListener("touchcancel", endGesture, { passive: true });

    window.addEventListener(
      "wheel",
      (e) => {
        if (isVerticallyScrollable()) return;
        parent.postMessage({ scrollTopDelta: e.deltaY }, "*");
      },
      { passive: true }
    );
  }
  enableScrollForwardingToParent();

  // ---------------- Audio ----------------
  let audioCtx = null;
  let masterGain = null;

  const bufferCache = new Map();
  const activeVoices = new Set();

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      alert("Your browser doesn’t support Web Audio (required for playback).");
      return null;
    }
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(audioCtx.destination);
    return audioCtx;
  }

  async function resumeAudioIfNeeded() {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {}
    }
  }

  function trackVoice(src, gain) {
    const voice = { src, gain };
    activeVoices.add(voice);
    src.onended = () => activeVoices.delete(voice);
    return voice;
  }

  function stopAllAudio(fadeSec = 0.06) {
    const ctx = ensureAudio();
    if (!ctx) return;

    const now = ctx.currentTime;
    const fade = Math.max(0.02, Number.isFinite(fadeSec) ? fadeSec : 0.06);

    for (const v of Array.from(activeVoices)) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, fade / 6);
        v.src.stop(now + fade + 0.02);
      } catch {}
    }
  }

  function urlFor(name) {
    return `${AUDIO_DIR}/${name}`;
  }

  async function loadBuffer(url) {
    if (bufferCache.has(url)) return bufferCache.get(url);

    const p = (async () => {
      const ctx = ensureAudio();
      if (!ctx) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        return await ctx.decodeAudioData(ab);
      } catch {
        return null;
      }
    })();

    bufferCache.set(url, p);
    return p;
  }

  function playOneShot(buffer, whenSec, gainValue) {
    const ctx = ensureAudio();
    if (!ctx || !masterGain || !buffer) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const g = ctx.createGain();
    const gVal = Math.max(0, gainValue);

    const dur = Math.max(0.01, buffer.duration);
    const fadeTail = Math.min(0.04, dur * 0.25);
    const endTime = whenSec + dur;

    g.gain.setValueAtTime(gVal, whenSec);
    g.gain.setValueAtTime(gVal, Math.max(whenSec, endTime - fadeTail));
    g.gain.linearRampToValueAtTime(0, endTime);

    src.connect(g);
    g.connect(masterGain);

    trackVoice(src, g);
    src.start(whenSec);
    src.stop(endTime + 0.05);
  }

  let kickBuf = null;
  let snareBuf = null;

  let metroHighBuf = null;
  let metroLowBuf = null;

  async function preloadAudio() {
    await resumeAudioIfNeeded();
    const [k, s, mh, ml] = await Promise.all([
      loadBuffer(urlFor("kick1.mp3")),
      loadBuffer(urlFor("snare1.mp3")),
      loadBuffer(urlFor("metronomehigh.mp3")),
      loadBuffer(urlFor("metronomelow.mp3")),
    ]);
    kickBuf = k;
    snareBuf = s;
    metroHighBuf = mh;
    metroLowBuf = ml;
  }

  // ---------------- Game model ----------------
  const PHASE = {
    COUNTIN: "countin",
    LISTEN: "listen",
    READY: "ready",
    PLAY: "play",
    SCORE: "score",
  };

  const CYCLE_BEATS = 16;

  const scoreState = {
    rounds: 0,
    last: null,
    total: 0,
    avg: 0,
    history: [],
    totalAvgErrMs: 0,
    avgErrMs: 0,
    lastErrMs: null,
  };

  function setScoreUI() {
    roundsOut.textContent = String(scoreState.rounds);
    lastScoreOut.textContent = scoreState.last ? `${scoreState.last}/5` : "—";
    avgScoreOut.textContent = scoreState.rounds ? `${scoreState.avg.toFixed(1)}/5` : "—";
    avgMsOut.textContent = scoreState.rounds ? `${Math.round(scoreState.avgErrMs)}ms` : "—";
  }

  function setFeedback(html) {
    feedbackOut.innerHTML = html || "";
    postHeightNow();
  }

  function setPhase(title, sub) {
    phaseTitle.textContent = title;
    phaseSub.innerHTML = sub || "";
  }

  function setFeedbackGlow(score1to5) {
    if (!score1to5) {
      delete feedbackCard.dataset.score;
      scoreBar.style.width = "0%";
      scoreBar.style.background = "var(--score3)";
      return;
    }
    feedbackCard.dataset.score = String(score1to5);
    scoreBar.style.width = "100%";
    const c =
      score1to5 === 1
        ? "var(--score1)"
        : score1to5 === 2
        ? "var(--score2)"
        : score1to5 === 3
        ? "var(--score3)"
        : score1to5 === 4
        ? "var(--score4)"
        : "var(--score5)";
    scoreBar.style.background = c;
  }

  const SCORE_WORD = { 1: "Poor", 2: "Okay", 3: "Good!", 4: "Very Good!", 5: "Excellent!" };

  const FEEDBACK_TEXT = {
    1: "Hmmm, give it another go! 🧐",
    2: "A good start! Keep going! 💪",
    3: "That's good! Let's get to 5 though! 👏",
    4: "Very good! That was pretty accurate! 🧐",
    5: "Brilliant! 🤩 You've got rhythm! 🥁🫡🎉",
  };

  const FINAL_AVG_TEXT = (avg) => {
    const rounded = Math.round(avg);
    if (rounded <= 1)
      return "You scored an average of 1/5 - You're down but you're not out! Give it another go and see if you can improve ☝️";
    if (rounded === 2)
      return "You scored an average of 2/5 - That's not a bad way to begin, but I reckon you've got a higher score in you!";
    if (rounded === 3)
      return "You scored an average of 3/5 - That's not bad at all, though the higher scores are calling your name 😉";
    if (rounded === 4)
      return "You scored an average of 4/5 - That's pretty great! A score to be proud of, but can you go one further? 💪🧐";

    const opts = [
      "You scored an average of 5/5 - Hey that's awesome! The local Samba band called by to ask when you can start 😉 If you haven't already, try upping the difficulty!",
      "You scored an average of 5/5 - A top result! 🎉💯 Kesha stopped by and said you're heart beats to the beat of the drum, and she was definitely on to something! ❤️🥁 If you haven't already, try upping the difficulty!",
      "You scored an average of 5/5 - Excellent - you've got real skills! 🎉💯 Apparently The New Radicals wrote a song with lyrics about you back in 1998 and it's 5/5 worth a listen ❤️ If you haven't already, try upping the difficulty!",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  };

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function bpmValue() {
    const v = Number(bpmNum.value);
    return clamp(Number.isFinite(v) ? v : 70, 40, 140);
  }

  function beatDurSec() {
    return 60 / bpmValue();
  }

  function difficulty() {
    return String(difficultySel.value || "simple");
  }

  // ---------------- Pattern library ----------------
  const PATTERNS = {
    simple: [
      [{ t: 0, i: "K" }, { t: 1, i: "S" }, { t: 2, i: "K" }, { t: 3, i: "S" }],
      [{ t: 0, i: "K" }, { t: 2, i: "S" }],
      [{ t: 0, i: "K" }, { t: 2, i: "K" }, { t: 3, i: "S" }],
      [{ t: 0, i: "K" }, { t: 1, i: "S" }, { t: 3, i: "S" }],
      [{ t: 0, i: "K" }, { t: 2, i: "S" }],
      [{ t: 0, i: "K" }, { t: 2, i: "K" }],
      [{ t: 0, i: "S" }, { t: 2, i: "K" }],
    ],
    medium: [
      [{ t: 0, i: "K" }, { t: 1, i: "S" }, { t: 2, i: "K" }, { t: 3, i: "S" }, { t: 3.5, i: "K" }],
      [{ t: 0, i: "K" }, { t: 0.5, i: "K" }, { t: 1, i: "S" }, { t: 2, i: "K" }, { t: 3, i: "S" }],
      [{ t: 0, i: "K" }, { t: 1.5, i: "K" }, { t: 2, i: "S" }, { t: 3.5, i: "K" }],
      [{ t: 0, i: "K" }, { t: 1, i: "S" }, { t: 2.5, i: "K" }, { t: 3, i: "S" }],
      [{ t: 0, i: "K" }, { t: 1, i: "S" }, { t: 2, i: "K" }, { t: 2.5, i: "K" }, { t: 3, i: "S" }],
      [{ t: 0, i: "K" }, { t: 1.5, i: "S" }, { t: 2, i: "K" }, { t: 3, i: "S" }],
    ],
    difficult: [
      [{ t: 0, i: "K" }, { t: 0.75, i: "K" }, { t: 1, i: "S" }, { t: 2, i: "K" }, { t: 2.5, i: "K" }, { t: 3, i: "S" }],
      [{ t: 0, i: "K" }, { t: 0.5, i: "K" }, { t: 1, i: "S" }, { t: 1.75, i: "K" }, { t: 2, i: "K" }, { t: 3, i: "S" }],
      [{ t: 0, i: "K" }, { t: 1, i: "S" }, { t: 2, i: "K" }, { t: 2.25, i: "K" }, { t: 2.5, i: "K" }, { t: 3, i: "S" }],
      [{ t: 0, i: "K" }, { t: 0.25, i: "K" }, { t: 1, i: "S" }, { t: 2, i: "K" }, { t: 2.75, i: "K" }, { t: 3, i: "S" }],
      [{ t: 0, i: "K" }, { t: 1, i: "S" }, { t: 1.5, i: "K" }, { t: 2, i: "K" }, { t: 2.75, i: "S" }, { t: 3.25, i: "K" }],
    ],
    complex: [
      [{ t: 0, i: "K" }, { t: 1, i: "S" }, { t: 2, i: "K" }, { t: 2.5, i: "K" }, { t: 3, i: "S" }],
      [{ t: 0, i: "K" }, { t: 0.5, i: "K" }, { t: 1, i: "S" }, { t: 2, i: "K" }, { t: 3, i: "S" }],
      [{ t: 0, i: "K" }, { t: 1.5, i: "K" }, { t: 2, i: "S" }, { t: 3.5, i: "K" }],
      [{ t: 0, i: "K" }, { t: 1, i: "S" }, { t: 1.5, i: "K" }, { t: 2.5, i: "S" }, { t: 3.5, i: "K" }],
    ],
  };

  function pickPattern() {
    const d = difficulty();
    const list = PATTERNS[d] || PATTERNS.simple;
    const p = list[Math.floor(Math.random() * list.length)];
    return p.map((x) => ({ t: x.t, i: x.i }));
  }

  function applySwingToBeatTime(beatTime) {
    const whole = Math.floor(beatTime);
    const frac = beatTime - whole;
    if (Math.abs(frac - 0.5) < 1e-6) return whole + SWING_FIRST_FRACTION;
    return beatTime;
  }

  function patternTimesSec(pattern, barStartSec) {
    const bd = beatDurSec();
    const isSwing = difficulty() === "complex";
    return pattern.map((ev) => {
      const bt = isSwing ? applySwingToBeatTime(ev.t) : ev.t;
      return { when: barStartSec + bt * bd, i: ev.i, beatT: bt };
    });
  }

  // ---------------- Scheduler / timeline ----------------
  let started = false;
  let paused = false;

  let schedTimer = null;
  let nextBeatTimeSec = 0;
  let globalBeatIndex = 0;
  let phase = PHASE.COUNTIN;
  let countInRemaining = 4;

  let currentPattern = [];
  let expectedPlayEvents = [];

  let roundHits = []; // {tSec, i}

  let captureWindow = null; // { startSec, endSec }
  let playBarStartSec = 0;

  function setControls() {
    beginBtn.classList.toggle("pulse", !started);
    pauseBtn.disabled = !started;
    stopBtn.disabled = !started;

    const canHit = started && !paused;
    kickBtn.disabled = !canHit;
    snareBtn.disabled = !canHit;
  }

  function flashBeatDot(idx0to3) {
    beatDots.forEach((d, i) => d.classList.toggle("on", i === idx0to3));
    setTimeout(() => {
      beatDots.forEach((d, i) => {
        if (i === idx0to3) d.classList.remove("on");
      });
    }, BEAT_FLASH_MS);
  }

  function playMetronomeClick(whenSec, isDownbeat) {
    const buf = isDownbeat ? metroHighBuf : metroLowBuf;
    if (!buf) return;
    playOneShot(buf, whenSec, METRONOME_GAIN);
  }

  function playDrum(i, whenSec) {
    const buf = i === "K" ? kickBuf : snareBuf;
    if (!buf) return;
    playOneShot(buf, whenSec, DRUM_GAIN);
  }

  let countInAnchorBeat = 0;

  function cycleBeatOffset(beatIdx) {
    return ((beatIdx - countInAnchorBeat) % CYCLE_BEATS + CYCLE_BEATS) % CYCLE_BEATS;
  }

  function computePhaseFromCycleBeat(cb) {
    if (cb < 4) return PHASE.LISTEN;
    if (cb < 8) return PHASE.READY;
    if (cb < 12) return PHASE.PLAY;
    return PHASE.SCORE;
  }

  function onPhaseEnter(newPhase, barStartSec) {
    if (newPhase === PHASE.LISTEN) {
      currentPattern = pickPattern();
      expectedPlayEvents = [];
      roundHits = [];
      captureWindow = null;
      playBarStartSec = 0;

      setFeedbackGlow(null);
      setPhase("Listen", "Listen to the rhythm…");
      setFeedback("Listen to the 4-beat rhythm.");

      const evs = patternTimesSec(currentPattern, barStartSec);
      for (const ev of evs) playDrum(ev.i, ev.when);
    }

    if (newPhase === PHASE.READY) {
      setFeedbackGlow(null);
      setPhase("Get ready!", "Get ready! Next bar is yours.");
      setFeedback("<strong>Get ready!</strong> (you can tap early — we’ll catch it)");

      const bd = beatDurSec();
      playBarStartSec = barStartSec + 4 * bd;
      captureWindow = {
        startSec: playBarStartSec - CAPTURE_EARLY_BEATS * bd,
        endSec: playBarStartSec + 4 * bd + CAPTURE_LATE_BEATS * bd,
      };
    }

    if (newPhase === PHASE.PLAY) {
      setFeedbackGlow(null);
      setPhase("Your turn", "Play it back now: Kick (⬅️) / Snare (➡️).");
      setFeedback("Your turn — copy the rhythm!");

      expectedPlayEvents = patternTimesSec(currentPattern, barStartSec);
      setControls();
    }

    if (newPhase === PHASE.SCORE) {
      setPhase("Score", "Scoring…");
      const result = scoreRound(expectedPlayEvents, roundHits);

      scoreState.rounds += 1;
      scoreState.last = result.score;
      scoreState.total += result.score;
      scoreState.avg = scoreState.total / scoreState.rounds;

      scoreState.lastErrMs = result.avgErrMs;
      scoreState.totalAvgErrMs += result.avgErrMs;
      scoreState.avgErrMs = scoreState.totalAvgErrMs / scoreState.rounds;

      scoreState.history.push({
        score: result.score,
        details: result,
        bpm: bpmValue(),
        difficulty: difficulty(),
      });

      setScoreUI();
      setFeedbackGlow(result.score);

      const word = SCORE_WORD[result.score] || "";
      const txt = FEEDBACK_TEXT[result.score] || "";

      setFeedback(
        `<div class="scoreBigWrap">
           <div class="scoreBigLine">${result.score}/5</div>
           <div class="scoreBigWord">${word}</div>
         </div>
         <div class="scoreBelow">
           ${txt}<br/>
           <span class="dim">${result.summaryLine}</span>
         </div>`
      );

      setPhase("Score", "Take a breath… next round is coming.");
      setControls();
    }
  }

  function scoreRound(expected, actual) {
    const exp = expected.map((e) => ({ t: e.when, i: e.i })).sort((a, b) => a.t - b.t);
    const act = actual.map((a) => ({ t: a.tSec, i: a.i })).sort((a, b) => a.t - b.t);

    const maxMs = SCORING.MATCH_MAX_MS;

    const usedAct = new Set();
    const matches = [];

    for (let ei = 0; ei < exp.length; ei++) {
      const e = exp[ei];
      let bestIdx = -1;
      let bestErr = Infinity;

      for (let ai = 0; ai < act.length; ai++) {
        if (usedAct.has(ai)) continue;
        const a = act[ai];
        if (a.i !== e.i) continue;

        const errMs = Math.abs(a.t - e.t) * 1000;
        if (errMs <= maxMs && errMs < bestErr) {
          bestErr = errMs;
          bestIdx = ai;
        }
      }

      if (bestIdx >= 0) {
        usedAct.add(bestIdx);
        matches.push({ errMs: bestErr, i: e.i });
      }
    }

    const misses = exp.length - matches.length;
    const extras = act.length - usedAct.size;

    const avgErrMs = matches.length
      ? matches.reduce((s, m) => s + m.errMs, 0) / matches.length
      : maxMs;

    const totalExpected = Math.max(1, exp.length);
    const missPenalty = misses / totalExpected;
    const extraPenalty = extras / totalExpected;

    const effectiveErr = avgErrMs * (1 + 0.85 * missPenalty + 0.55 * extraPenalty);

    let score = 1;
    if (effectiveErr <= SCORING.TIER_5_MS && misses === 0 && extras === 0) score = 5;
    else if (effectiveErr <= SCORING.TIER_4_MS) score = 4;
    else if (effectiveErr <= SCORING.TIER_3_MS) score = 3;
    else if (effectiveErr <= SCORING.TIER_2_MS) score = 2;

    const summaryLine = `Matched ${matches.length}/${exp.length}, Missed ${misses}, Extra ${extras}, Avg timing error ~${Math.round(
      avgErrMs
    )}ms`;

    return { score, matches, misses, extras, avgErrMs, effectiveErr, summaryLine };
  }

  function scheduleTick() {
    const ctx = ensureAudio();
    if (!ctx || !started) return;

    while (nextBeatTimeSec < ctx.currentTime + SCHED_AHEAD_SEC) {
      const thisBeatTimeSec = nextBeatTimeSec;
      const beatIdx = globalBeatIndex;

      const inBarIdx = ((beatIdx % 4) + 4) % 4;
      const isDownbeat = inBarIdx === 0;

      playMetronomeClick(thisBeatTimeSec, isDownbeat);

      const dtMs = Math.max(0, (thisBeatTimeSec - ctx.currentTime) * 1000);
      window.setTimeout(() => flashBeatDot(inBarIdx), dtMs);

      if (phase === PHASE.COUNTIN) {
        const shown = Math.max(0, countInRemaining);
        window.setTimeout(() => {
          setPhase("Starting", `Beginning in <strong>${shown}</strong>…`);
          setFeedback(`Beginning in <strong>${shown}</strong>…`);
        }, dtMs);

        countInRemaining -= 1;

        if (countInRemaining <= 0) {
          phase = PHASE.LISTEN;
          countInAnchorBeat = beatIdx + 1;
        }
      } else {
        const cb = cycleBeatOffset(beatIdx);
        const newPhase = computePhaseFromCycleBeat(cb);

        const isPhaseBoundary =
          (cb === 0 && newPhase === PHASE.LISTEN) ||
          (cb === 4 && newPhase === PHASE.READY) ||
          (cb === 8 && newPhase === PHASE.PLAY) ||
          (cb === 12 && newPhase === PHASE.SCORE);

        if (isPhaseBoundary) {
          window.setTimeout(() => {
            phase = newPhase;
            onPhaseEnter(newPhase, thisBeatTimeSec);
            setControls();
          }, dtMs);
        }
      }

      globalBeatIndex += 1;
      nextBeatTimeSec += beatDurSec();
    }
  }

  function startScheduler() {
    if (schedTimer) window.clearInterval(schedTimer);
    schedTimer = window.setInterval(scheduleTick, SCHED_TICK_MS);
  }

  function stopScheduler() {
    if (schedTimer) window.clearInterval(schedTimer);
    schedTimer = null;
  }

  // ---------------- Input ----------------
  function flashPad(btn) {
    btn.classList.remove("flash");
    btn.offsetWidth;
    btn.classList.add("flash");
  }

  function isWithinCaptureWindow(nowSec) {
    if (!captureWindow) return false;
    return nowSec >= captureWindow.startSec && nowSec <= captureWindow.endSec;
  }

  function registerHit(i) {
    const ctx = ensureAudio();
    if (!ctx || !started || paused) return;

    const now = ctx.currentTime;

    playDrum(i, now);
    if (i === "K") flashPad(kickBtn);
    else flashPad(snareBtn);

    if (isWithinCaptureWindow(now)) {
      roundHits.push({ tSec: now, i });
    }
  }

  // Immediate touch/pointer input for pads (no waiting for touchend "click")
  let ignoreClicksUntilTs = 0;

  function shouldIgnoreClickNow() {
    return performance.now() < ignoreClicksUntilTs;
  }

  function bindImmediatePad(btn, instrument) {
    // Pointer events cover mouse + touch + pen, and fire on initial contact.
    btn.addEventListener(
      "pointerdown",
      async (e) => {
        if (btn.disabled) return;

        // prevent synthetic click + long-press behaviors
        e.preventDefault();
        e.stopPropagation();

        ignoreClicksUntilTs = performance.now() + GHOST_CLICK_BLOCK_MS;

        // Ensure audio starts on a user gesture (Safari/iOS requirement)
        await resumeAudioIfNeeded();

        try {
          if (btn.setPointerCapture && e.pointerId != null) btn.setPointerCapture(e.pointerId);
        } catch {}

        registerHit(instrument);
      },
      { passive: false }
    );

    // Keep click for non-pointer browsers, but block ghost clicks after pointerdown.
    btn.addEventListener("click", (e) => {
      if (shouldIgnoreClickNow()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      registerHit(instrument);
    });
  }

  // ---------------- Modals ----------------
  function showInfo() {
    infoModal.classList.remove("hidden");
  }
  function hideInfo() {
    infoModal.classList.add("hidden");
  }

  infoBtn?.addEventListener("click", showInfo);
  infoOk?.addEventListener("click", hideInfo);
  infoModal?.addEventListener("click", (e) => {
    if (e.target === infoModal) hideInfo();
  });

  function showSummary() {
    const avg = scoreState.rounds ? scoreState.avg : 0;
    const avgText = scoreState.rounds ? `${avg.toFixed(1)}/5` : "—";

    const lines = [`Rounds played: ${scoreState.rounds}`, `Average score: ${avgText}`, "", FINAL_AVG_TEXT(avg)];

    summaryBody.textContent = lines.join("\n");
    summaryModal.classList.remove("hidden");
    summaryClose.focus();
  }

  function hideSummary() {
    summaryModal.classList.add("hidden");
  }

  summaryClose.addEventListener("click", hideSummary);
  summaryModal.addEventListener("click", (e) => {
    if (e.target === summaryModal) hideSummary();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!infoModal.classList.contains("hidden")) hideInfo();
      if (!summaryModal.classList.contains("hidden")) hideSummary();
    }
  });

  // ---------------- Scorecard PNG ----------------
  function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  }

  function drawCardBase(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fbfbfc";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    ctx.fillStyle = "#111";
    ctx.fillRect(8, 8, w - 16, 74);
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text).split(/\s+/);
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y);
  }

  function getPlayerName() {
    const prev = localStorage.getItem("hol_player_name") || "";
    const name = window.prompt("Enter your name for the score card:", prev) ?? "";
    const trimmed = String(name).trim();
    if (trimmed) localStorage.setItem("hol_player_name", trimmed);
    return trimmed || "Player";
  }

  async function downloadScoreCardPng(playerName) {
    const w = 760;
    const h = 560;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawCardBase(ctx, w, h);

    ctx.fillStyle = "#fff";
    ctx.font = "900 30px Arial";
    ctx.fillText("Got Rhythm — Scorecard", 28, 56);

    const bodyX = 28;
    const bodyY = 130;

    ctx.fillStyle = "#111";
    ctx.font = "900 22px Arial";
    ctx.fillText("Summary", bodyX, bodyY);

    ctx.font = "700 20px Arial";
    const avg = scoreState.rounds ? scoreState.avg : 0;
    const avgText = scoreState.rounds ? `${avg.toFixed(1)}/5` : "—";
    const avgMsText = scoreState.rounds ? `${Math.round(scoreState.avgErrMs)}ms` : "—";

    const lines = [
      `Name: ${playerName}`,
      `Difficulty: ${difficultySel.options[difficultySel.selectedIndex]?.text || difficulty()}`,
      `Metronome: ${bpmValue()} bpm`,
      `Rounds played: ${scoreState.rounds}`,
      `Average score: ${avgText}`,
      `Last score: ${scoreState.last ? `${scoreState.last}/5` : "—"}`,
      `Avg ms accuracy: ${avgMsText}`,
      "",
      FINAL_AVG_TEXT(avg),
    ];

    let y = bodyY + 44;
    for (const ln of lines) {
      if (ln === "") {
        y += 16;
        continue;
      }
      if (y > h - 90) break;
      drawWrappedText(ctx, ln, bodyX, y, w - 56, 28);
      y += 32;
    }

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.font = "700 16px Arial";
    ctx.fillText("Downloaded from www.eartraininglab.com 🥁", bodyX, h - 36);

    const blob = await canvasToPngBlob(canvas);
    if (blob) downloadBlob(blob, "Got Rhythm Scorecard.png");
  }

  async function onDownloadScoreCard() {
    const name = getPlayerName();
    await downloadScoreCardPng(name);
  }

  // ---------------- Controls / lifecycle ----------------
  function resetStateToIdle() {
    started = false;
    paused = false;

    stopScheduler();
    stopAllAudio(0.06);

    phase = PHASE.COUNTIN;
    countInRemaining = 4;
    globalBeatIndex = 0;
    countInAnchorBeat = 0;

    currentPattern = [];
    expectedPlayEvents = [];
    roundHits = [];
    captureWindow = null;
    playBarStartSec = 0;

    scoreState.rounds = 0;
    scoreState.last = null;
    scoreState.total = 0;
    scoreState.avg = 0;
    scoreState.history = [];
    scoreState.totalAvgErrMs = 0;
    scoreState.avgErrMs = 0;
    scoreState.lastErrMs = null;

    setScoreUI();
    setFeedbackGlow(null);

    setPhase("Ready", "Press <strong>Begin Game</strong> to start.");
    setFeedback("Press <strong>Begin Game</strong> to start.");
    beatDots.forEach((d) => d.classList.remove("on"));

    beginBtn.textContent = "Begin Game";
    pauseBtn.textContent = "Pause";
    beginBtn.classList.add("pulse");

    setControls();
    postHeightNow();
  }

  async function beginGame() {
    await preloadAudio();
    await resumeAudioIfNeeded();

    const ctx = ensureAudio();
    if (!ctx) return;

    started = true;
    paused = false;

    beginBtn.textContent = "Restart Game";
    beginBtn.classList.remove("pulse");

    phase = PHASE.COUNTIN;
    countInRemaining = 4;
    globalBeatIndex = 0;
    countInAnchorBeat = 0;

    currentPattern = [];
    expectedPlayEvents = [];
    roundHits = [];
    captureWindow = null;
    playBarStartSec = 0;

    nextBeatTimeSec = ctx.currentTime + 0.10;

    setScoreUI();
    setFeedbackGlow(null);
    setPhase("Starting", "Beginning in <strong>4</strong>…");
    setFeedback("Beginning in <strong>4</strong>…");

    setControls();
    startScheduler();
  }

  async function restartGame() {
    stopAllAudio(0.06);
    stopScheduler();

    scoreState.rounds = 0;
    scoreState.last = null;
    scoreState.total = 0;
    scoreState.avg = 0;
    scoreState.history = [];
    scoreState.totalAvgErrMs = 0;
    scoreState.avgErrMs = 0;
    scoreState.lastErrMs = null;

    setScoreUI();
    setFeedbackGlow(null);

    await beginGame();
  }

  async function togglePause() {
    if (!started) return;
    const ctx = ensureAudio();
    if (!ctx) return;

    if (!paused) {
      paused = true;
      pauseBtn.textContent = "Continue";
      setPhase("Paused", "Press <strong>Continue</strong> to resume exactly where you left off.");
      setFeedback("Paused.");
      setControls();
      try {
        await ctx.suspend();
      } catch {}
      return;
    }

    try {
      await ctx.resume();
    } catch {}
    paused = false;
    pauseBtn.textContent = "Pause";
    setControls();
  }

  function stopAndReset() {
    if (!started) return;
    showSummary();
    resetStateToIdle();
  }

  // ---------------- Events ----------------
  function syncBpmInputs(from) {
    const v = clamp(Number(from.value), 40, 140);
    bpmRange.value = String(v);
    bpmNum.value = String(v);

    const ctx = ensureAudio();
    if (ctx && started && !paused) {
      nextBeatTimeSec = Math.max(nextBeatTimeSec, ctx.currentTime + 0.05);
    }
  }

  bpmRange.addEventListener("input", () => syncBpmInputs(bpmRange));
  bpmNum.addEventListener("input", () => syncBpmInputs(bpmNum));

  beginBtn.addEventListener("click", async () => {
    if (!started) await beginGame();
    else await restartGame();
  });

  pauseBtn.addEventListener("click", togglePause);
  stopBtn.addEventListener("click", stopAndReset);

  downloadScoreBtn.addEventListener("click", onDownloadScoreCard);
  summaryDownload.addEventListener("click", onDownloadScoreCard);

  // UPDATED: immediate press on touchscreens (and still supports mouse)
  bindImmediatePad(kickBtn, "K");
  bindImmediatePad(snareBtn, "S");

  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (!started || paused) return;

    if (e.code === "ArrowLeft") {
      e.preventDefault();
      registerHit("K");
      return;
    }
    if (e.code === "ArrowRight") {
      e.preventDefault();
      registerHit("S");
      return;
    }
  });

  difficultySel.addEventListener("change", () => {
    setFeedback("Difficulty updated — it will apply from the next round.");
    postHeightNow();
  });

  // ---------------- Init ----------------
  resetStateToIdle();

  function updateStartDependentButtons() {
    pauseBtn.disabled = !started;
    stopBtn.disabled = !started;
  }
  updateStartDependentButtons();

  syncBpmInputs(bpmNum);

  summaryClose.addEventListener("click", hideSummary);
})();
