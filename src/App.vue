<script setup lang="ts">
import { ref, onMounted, computed, type CSSProperties } from "vue";

interface Shift {
  date: number;
  value: number | string;
}

interface MonthSchedule {
  year: number;
  month: number;
  shifts: Shift[];
}

interface WorkInterval {
  start: Date;
  end: Date;
}

const SHIFT_TYPES = {
  MORNING: 1, // 早班 (0800-1600)
  EVENING: 2, // 晚班 (1600-2400)
  NIGHT: 3,   // 大夜 (2400-0800)
} as const;

const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"] as const;

const SHIFT_SLOT_LABELS = ["08:00–16:00", "16:00–24:00", "24:00–08:00 (D+1)"] as const;

const scheduleData = ref<MonthSchedule[]>([]);
const workIntervals = ref<WorkInterval[]>([]);
const now = ref(new Date());
const isLoading = ref(true);

function processShifts(data: MonthSchedule[]) {
  const intervals: WorkInterval[] = [];
  data.forEach((monthData) => {
    monthData.shifts.forEach((shift) => {
      if (typeof shift.value === "number") {
        const year = monthData.year;
        const month = monthData.month - 1;
        const day = shift.date;
        let start: Date, end: Date;

        if (shift.value === SHIFT_TYPES.MORNING) {
          start = new Date(year, month, day, 8, 0, 0);
          end   = new Date(year, month, day, 16, 0, 0);
        } else if (shift.value === SHIFT_TYPES.EVENING) {
          const nextDay = new Date(year, month, day);
          nextDay.setDate(nextDay.getDate() + 1);
          start = new Date(year, month, day, 16, 0, 0);
          end   = new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate(), 0, 0, 0);
        } else if (shift.value === SHIFT_TYPES.NIGHT) {
          start = new Date(year, month, day, 0, 0, 0);
          end   = new Date(year, month, day, 8, 0, 0);
        } else {
          return;
        }
        intervals.push({ start, end });
      }
    });
  });
  return intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
}

onMounted(async () => {
  try {
    const response = await fetch(import.meta.env.BASE + "data/panda.json");
    if (!response.ok) throw new Error("Network response was not ok");
    const data: MonthSchedule[] = await response.json();
    scheduleData.value = data;
    workIntervals.value = processShifts(data);
  } catch (error) {
    console.error("Failed to load schedule data:", error);
  } finally {
    isLoading.value = false;
  }

  setInterval(() => { now.value = new Date(); }, 1000);

  setInterval(() => {
    fetch(import.meta.env.BASE + "data/panda.json")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => {
        scheduleData.value = data;
        workIntervals.value = processShifts(data);
      })
      .catch((e) => console.error("Failed to reload schedule data:", e));
  }, 60000);
});

const activeShift = computed(() =>
  workIntervals.value.find(
    (i) => now.value.getTime() >= i.start.getTime() && now.value.getTime() < i.end.getTime()
  )
);

const currentStatus = computed(() => (activeShift.value ? "在上班" : "在休息"));

const currentStatusEn = computed(() => {
  if (isLoading.value) return "CONNECTING...";
  return activeShift.value ? "ON DUTY" : "OFF DUTY";
});

const shiftTimeInfo = computed(() => {
  const currentTime = now.value.getTime();
  if (activeShift.value) {
    const diff = activeShift.value.end.getTime() - currentTime;
    const hours   = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `距離下班還有：${hours}h ${minutes}min`;
  }
  const nextShift = workIntervals.value.find((i) => i.start.getTime() > currentTime);
  if (!nextShift) return "沒有更多班表資訊";
  const diff = nextShift.start.getTime() - currentTime;
  const hours   = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `離下次上班還有：${hours}h ${minutes}min`;
});

type Status = "WORK" | "REST" | "UNKNOWN";

function shiftLabel(shiftType: Status, slotIndex: number): string {
  const time   = SHIFT_SLOT_LABELS[slotIndex] ?? "";
  const status = shiftType === "WORK" ? "上班中" : shiftType === "REST" ? "休息中" : "未知";
  return `${time} ${status}`;
}

const displayDays = ref(5);
const loadMore = () => { displayDays.value += 5; };

const scheduleForDisplay = computed(() => {
  if (!scheduleData.value.length) return [];

  const today = new Date();
  if (now.value.getHours() < 8) today.setDate(today.getDate() - 1);

  const result = [];

  for (let i = 0; i < displayDays.value; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const year  = date.getFullYear();
    const month = date.getMonth() + 1;
    const day   = date.getDate();
    const dow   = date.getDay();

    const monthData = scheduleData.value.find((m) => m.year === year && m.month === month);
    const shift = monthData?.shifts.find((s) => s.date === day);
    const shiftColor =
      shift == null
        ? (["UNKNOWN", "UNKNOWN"] as const)
        : shift.value === SHIFT_TYPES.MORNING
        ? (["WORK", "REST"] as const)
        : shift.value === SHIFT_TYPES.EVENING
        ? (["REST", "WORK"] as const)
        : (["REST", "REST"] as const);

    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const ndy   = nextDay.getFullYear();
    const ndm   = nextDay.getMonth() + 1;
    const ndd   = nextDay.getDate();
    const ndData = scheduleData.value.find((m) => m.year === ndy && m.month === ndm);
    const ndShift = ndData?.shifts.find((s) => s.date === ndd);
    const shiftColorNextDay =
      ndShift == null
        ? (["UNKNOWN"] as const)
        : ndShift.value === SHIFT_TYPES.NIGHT
        ? (["WORK"] as const)
        : (["REST"] as const);

    const shifts: [Status, Status, Status] = [...shiftColor, ...shiftColorNextDay];

    result.push({
      dateLabel: `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
      dayName: DAY_NAMES[dow],
      isWeekend: dow === 0 || dow === 6,
      shifts,
    });
  }
  return result;
});

const timelineStyle = computed((): CSSProperties => {
  const now_ = now.value;
  const today8AM = new Date(now_);
  today8AM.setHours(8, 0, 0, 0);
  if (now_.getTime() < today8AM.getTime()) today8AM.setDate(today8AM.getDate() - 1);
  const minutesSince8AM = (now_.getTime() - today8AM.getTime()) / (1000 * 60);
  const percent = Math.max(0, Math.min(100, (minutesSince8AM / (24 * 60)) * 100));
  return { left: `${percent}%` };
});
</script>

<template>
  <div class="container">

    <!-- ── Header ── -->
    <header class="header">
      <h1 class="title">
        <span class="title-prefix" aria-hidden="true">⬡</span>
        <span class="title-en">PANDA STATUS TRACKER</span>
        <span class="title-zh">現在在上班嗎？</span>
      </h1>
      <hr class="section-rule" aria-hidden="true" />
    </header>

    <!-- ── Status Panel ── -->
    <div
      class="status-panel"
      :class="{ 'on-duty': currentStatus === '在上班' }"
      role="status"
      :aria-label="`目前狀態：${isLoading ? '讀取中' : currentStatus}`"
    >
      <div class="status-glyph" aria-hidden="true">●</div>
      <div class="status-zh">{{ isLoading ? "讀取中..." : currentStatus }}</div>
      <div class="status-en" aria-hidden="true">{{ currentStatusEn }}</div>
      <p class="countdown" aria-live="off">{{ isLoading ? "\u00a0" : shiftTimeInfo }}</p>
    </div>

    <!-- ── Schedule ── -->
    <section class="schedule-container" role="region" aria-label="Panda 的班表時間表">

      <div class="section-axis" aria-hidden="true">
        <span class="section-today">今日</span>
        <span class="section-d1">D+1</span>
      </div>

      <div class="time-axis" aria-hidden="true">
        <span class="time-mark start">08:00</span>
        <span class="time-mark mid-1">16:00</span>
        <span class="time-mark mid-2">24:00</span>
        <span class="time-mark end">08:00</span>
      </div>

      <div class="schedule-grid" role="grid">
        <div
          v-for="(day, index) in scheduleForDisplay"
          :key="day.dateLabel"
          class="day-row"
          :class="{ today: index === 0 }"
          :style="{ '--row-index': index }"
          role="row"
          :aria-label="`${day.dateLabel} 星期${day.dayName}`"
        >
          <div class="date-label" role="rowheader">
            <span class="date-md">{{ day.dateLabel }}</span>
            <span class="date-dow" :class="{ weekend: day.isWeekend }">{{ day.dayName }}</span>
          </div>

          <div class="shifts">
            <div
              v-for="(shiftType, shiftIndex) of day.shifts"
              :key="shiftIndex"
              class="shift-block"
              :class="{
                work:    shiftType === 'WORK',
                rest:    shiftType === 'REST',
                unknown: shiftType === 'UNKNOWN',
              }"
              role="gridcell"
            >
              <span class="sr-only">{{ shiftLabel(shiftType, shiftIndex) }}</span>
            </div>

            <div
              v-if="index === 0"
              class="timeline-indicator"
              :style="timelineStyle"
              aria-hidden="true"
            >
              <span class="now-label">NOW</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Legend ── -->
    <div class="legend" aria-label="圖例">
      <span class="legend-item">
        <span class="legend-swatch work" aria-hidden="true"></span>上班
      </span>
      <span class="legend-item">
        <span class="legend-swatch rest" aria-hidden="true"></span>休息
      </span>
      <span class="legend-item">
        <span class="legend-swatch unknown" aria-hidden="true"></span>未知
      </span>
    </div>

    <!-- ── Load More ── -->
    <button class="load-more" @click="loadMore" aria-label="載入更多班表資料">
      <span class="btn-en" aria-hidden="true">▼ LOAD MORE</span>
      <span class="btn-sep" aria-hidden="true"> / </span>
      <span class="btn-zh">載入更多</span>
    </button>

  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   Keyframes
══════════════════════════════════════════ */
@keyframes neon-flicker {
  0%   { opacity: 0; }
  10%  { opacity: 0.9; }
  14%  { opacity: 0.2; }
  18%  { opacity: 1; }
  22%  { opacity: 0.5; }
  26%  { opacity: 1; }
  100% { opacity: 1; }
}

@keyframes pulse-line {
  0%, 100% { opacity: 1;   box-shadow: 0 0 6px #ff1f4b, 0 0 18px rgba(255,31,75,0.5); }
  50%       { opacity: 0.7; box-shadow: 0 0 12px #ff1f4b, 0 0 32px rgba(255,31,75,0.8); }
}

@keyframes now-bounce {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50%       { transform: translateX(-50%) translateY(-3px); }
}

@keyframes status-glow-rest {
  0%, 100% { box-shadow: 0 0 0 1px var(--c-neon-green), 0 0 10px rgba(57,255,20,0.12); }
  50%       { box-shadow: 0 0 0 1px var(--c-neon-green), 0 0 18px rgba(57,255,20,0.22); }
}

@keyframes status-glow-work {
  0%, 100% { box-shadow: 0 0 0 1px var(--c-neon-orange), 0 0 10px rgba(255,124,0,0.15); }
  50%       { box-shadow: 0 0 0 1px var(--c-neon-orange), 0 0 20px rgba(255,124,0,0.28); }
}

@keyframes slide-in {
  from { opacity: 0; transform: translateX(-6px); }
  to   { opacity: 1; transform: translateX(0); }
}

@keyframes corner-spark {
  0%   { opacity: 0; }
  50%  { opacity: 1; }
  70%  { opacity: 0.5; }
  100% { opacity: 1; }
}

/* ══════════════════════════════════════════
   Container
══════════════════════════════════════════ */
.container {
  --card-px: 2rem;
  position: relative;
  max-width: 780px;
  margin: 0 auto;
  padding: 2.5rem var(--card-px);
  text-align: center;
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border-accent);
  box-shadow:
    0 0 0 1px rgba(0, 245, 255, 0.06) inset,
    0 0 60px rgba(0, 245, 255, 0.04),
    0 20px 80px rgba(0, 0, 0, 0.6);
}

/* Top-left corner tick */
.container::before {
  content: "";
  position: absolute;
  top: -1px;
  left: -1px;
  width: 22px;
  height: 22px;
  border-top: 2px solid var(--c-neon-cyan);
  border-left: 2px solid var(--c-neon-cyan);
  animation: corner-spark 0.9s ease both;
}

/* Top-right corner tick */
.container::after {
  content: "";
  position: absolute;
  top: -1px;
  right: -1px;
  width: 22px;
  height: 22px;
  border-top: 2px solid var(--c-neon-cyan);
  border-right: 2px solid var(--c-neon-cyan);
  animation: corner-spark 0.9s ease both 0.1s;
}

/* ══════════════════════════════════════════
   Header
══════════════════════════════════════════ */
.header {
  margin-bottom: 2rem;
}

.title {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  margin: 0 0 1.25rem;
}

.title-prefix {
  font-size: 1.5rem;
  color: var(--c-neon-cyan);
  text-shadow: 0 0 8px rgba(0,245,255,0.35);
  line-height: 1;
  animation: neon-flicker 1.2s ease both;
}

.title-en {
  font-size: clamp(0.9rem, 3vw, 1.15rem);
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--c-neon-cyan);
  text-shadow: 0 0 8px rgba(0,245,255,0.25);
  animation: neon-flicker 1.2s ease both 0.1s;
}

.title-zh {
  font-size: clamp(1.6rem, 5vw, 2.6rem);
  font-weight: 900;
  letter-spacing: 0.04em;
  color: var(--c-text-primary);
  text-shadow: none;
  animation: neon-flicker 1.2s ease both 0.25s;
}

.section-rule {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--c-neon-cyan), transparent);
  opacity: 0.4;
  margin: 0;
}

/* ══════════════════════════════════════════
   Status Panel
══════════════════════════════════════════ */
.status-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 1.5rem 2rem;
  margin: 0 auto 2rem;
  max-width: 480px;
  background: var(--c-bg-surface-2);
  border: 1px solid var(--c-neon-green);
  animation: status-glow-rest 3s ease-in-out infinite;
}

.status-panel.on-duty {
  border-color: var(--c-neon-orange);
  animation: status-glow-work 2.5s ease-in-out infinite;
}

.status-glyph {
  font-size: 1rem;
  color: var(--c-neon-green);
  line-height: 1;
  margin-bottom: 0.1rem;
}

.status-panel.on-duty .status-glyph {
  color: var(--c-neon-orange);
}

.status-zh {
  font-size: clamp(2rem, 8vw, 3rem);
  font-weight: 900;
  letter-spacing: 0.08em;
  color: var(--c-neon-green);
  text-shadow: 0 0 12px rgba(57,255,20,0.2);
  line-height: 1;
}

.status-panel.on-duty .status-zh {
  color: var(--c-neon-orange);
  text-shadow: 0 0 12px rgba(255,124,0,0.2);
}

.status-en {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--c-text-secondary);
  margin-bottom: 0.75rem;
}

.countdown {
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
  color: var(--c-neon-cyan);
  letter-spacing: 0.04em;
  margin: 0;
  white-space: nowrap;
}

/* ══════════════════════════════════════════
   Schedule
══════════════════════════════════════════ */
.schedule-container {
  --date-label-w: 54px;
  position: relative;
  margin-left: calc(-1 * var(--card-px));
  width: calc(100% + 2 * var(--card-px));
  border-top: 1px solid var(--c-border-accent);
  border-bottom: 1px solid var(--c-border-accent);
  background: var(--c-bg-deepest);
  overflow: hidden;
  margin-bottom: 0;
}

/* Section axis — two-tier tab header, full width to match grid columns */
.section-axis {
  display: flex;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.section-today {
  flex: 2;
  padding: 5px 0 4px;
  text-align: center;
  border-top: 2px solid var(--c-neon-cyan);
  border-right: 1px solid var(--c-border-accent);
  color: var(--c-neon-cyan);
}

.section-d1 {
  flex: 1;
  padding: 5px 0 4px;
  text-align: center;
  border-top: 2px solid var(--c-neon-magenta);
  border-right: 1px solid var(--c-border-accent);
  color: var(--c-neon-magenta);
}

/* Time axis — full width to match grid columns */
.time-axis {
  position: relative;
  height: 1.4em;
  padding-top: 2px;
  border-bottom: 1px solid var(--c-border-accent);
  color: var(--c-text-secondary);
}

.time-axis span {
  position: absolute;
  font-size: 0.72em;
  font-variant-numeric: tabular-nums;
}

.time-axis .time-mark.start  { left: 0%;   transform: translateX(0); }
.time-axis .time-mark.mid-1  { left: 33.333%; transform: translateX(-50%); }
.time-axis .time-mark.mid-2  { left: 66.666%; transform: translateX(-50%); }
.time-axis .time-mark.end    { left: 100%; transform: translateX(-100%); }

/* Grid */
.schedule-grid {
  position: relative;
}

.schedule-grid::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(0, 0, 0, 0.35);
}

/* Day rows */
.day-row {
  display: flex;
  align-items: stretch;
  position: relative;
  animation: slide-in 0.28s ease both;
  animation-delay: calc(var(--row-index, 0) * 45ms);
}

.day-row::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(0, 0, 0, 0.35);
}

.day-row:hover {
  background: rgba(0, 245, 255, 0.025);
}

/* Today accent stripe */
.day-row.today::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--c-neon-cyan);
  box-shadow: 0 0 8px var(--c-neon-cyan);
  z-index: 10;
}

.day-row.today .date-md {
  color: #ffffff;
  font-weight: 700;
}

.day-row.today .date-dow {
  color: var(--c-neon-cyan);
}

/* Date label — absolute overlay on the left of each row */
.date-label {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--date-label-w);
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: rgba(5, 5, 18, 0.72);
  border-right: 1px solid rgba(0, 245, 255, 0.35);
}

.date-md {
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #a8a8cc;
  line-height: 1;
}

.date-dow {
  font-size: 0.62rem;
  color: var(--c-text-secondary);
  line-height: 1;
}

.date-dow.weekend {
  color: var(--c-neon-magenta);
}

/* Shift blocks — full width, date-label overlays as absolute */
.shifts {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  position: relative;
  min-height: 52px;
}

.shift-block {
  border-right: 1px solid rgba(37, 37, 80, 0.6);
}

.shift-block:last-child {
  border-right: none;
}

/* WORK — diagonal hatch */
.shift-block.work {
  background-color: rgba(255, 124, 0, 0.25);
  background-image: repeating-linear-gradient(
    -45deg,
    rgba(255, 124, 0, 0.55) 0px,
    rgba(255, 124, 0, 0.55) 2px,
    transparent 2px,
    transparent 9px
  );
}

/* REST — dot grid */
.shift-block.rest {
  background-color: rgba(57, 255, 20, 0.18);
  background-image: radial-gradient(
    circle,
    rgba(57, 255, 20, 0.55) 1px,
    transparent 1px
  );
  background-size: 9px 9px;
}

/* UNKNOWN — crosshatch on visibly distinct dark base */
.shift-block.unknown {
  background-color: #181830;
  background-image:
    repeating-linear-gradient(90deg, rgba(120, 120, 200, 0.25) 0px, rgba(120, 120, 200, 0.25) 1px, transparent 1px, transparent 12px),
    repeating-linear-gradient(0deg,  rgba(120, 120, 200, 0.25) 0px, rgba(120, 120, 200, 0.25) 1px, transparent 1px, transparent 12px);
}

/* NOW indicator */
.timeline-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #ff1f4b;
  transform: translateX(-50%);
  z-index: 10;
  animation: pulse-line 2s ease-in-out infinite;
}

.now-label {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #ff1f4b;
  text-shadow: 0 0 6px #ff1f4b;
  white-space: nowrap;
  animation: now-bounce 2s ease-in-out infinite;
  pointer-events: none;
}

/* ══════════════════════════════════════════
   Legend
══════════════════════════════════════════ */
.legend {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  align-items: center;
  margin-top: 0.75rem;
  margin-bottom: 1.25rem;
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--c-text-secondary);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.legend-swatch {
  width: 18px;
  height: 10px;
  border-radius: 1px;
  flex-shrink: 0;
}

.legend-swatch.work {
  background-color: rgba(255,124,0,0.3);
  background-image: repeating-linear-gradient(
    -45deg,
    rgba(255,124,0,0.7) 0px, rgba(255,124,0,0.7) 2px,
    transparent 2px, transparent 8px
  );
}

.legend-swatch.rest {
  background-color: rgba(57,255,20,0.2);
  background-image: radial-gradient(circle, rgba(57,255,20,0.7) 1px, transparent 1px);
  background-size: 7px 7px;
}

.legend-swatch.unknown {
  background-color: #181830;
  border: 1px solid rgba(120, 120, 200, 0.3);
  background-image:
    repeating-linear-gradient(90deg, rgba(120, 120, 200, 0.3) 0px, rgba(120, 120, 200, 0.3) 1px, transparent 1px, transparent 8px),
    repeating-linear-gradient(0deg,  rgba(120, 120, 200, 0.3) 0px, rgba(120, 120, 200, 0.3) 1px, transparent 1px, transparent 8px);
}

/* ══════════════════════════════════════════
   Load More Button
══════════════════════════════════════════ */
.load-more {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.7rem 2rem;
  border: 1px solid rgba(0, 245, 255, 0.45);
  background: transparent;
  color: var(--c-neon-cyan);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.load-more:hover {
  background: rgba(0, 245, 255, 0.08);
  border-color: rgba(0, 245, 255, 0.8);
  box-shadow: 0 0 14px rgba(0,245,255,0.15);
}

.load-more:active {
  background: rgba(0, 245, 255, 0.2);
  transform: scale(0.98);
}

/* ══════════════════════════════════════════
   Screen reader only
══════════════════════════════════════════ */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ══════════════════════════════════════════
   Mobile  ≤ 480px
══════════════════════════════════════════ */
@media (max-width: 480px) {
  .container {
    --card-px: 0.875rem;
    padding: 1.5rem 0.875rem;
  }

  .container::before,
  .container::after {
    width: 14px;
    height: 14px;
  }

  .schedule-container {
    --date-label-w: 50px;
  }

  .title-en {
    font-size: 0.72rem;
    letter-spacing: 0.14em;
  }

  .title-zh {
    font-size: 1.6rem;
  }

  .status-panel {
    padding: 1.1rem 1.25rem;
    margin-bottom: 1.5rem;
  }

  .status-zh {
    font-size: 2rem;
  }

  .section-axis {
    font-size: 0.58rem;
  }

  .time-axis span {
    font-size: 0.68em;
  }

  .date-md  { font-size: 0.68rem; }
  .date-dow { font-size: 0.58rem; }

  .legend {
    gap: 1rem;
    font-size: 0.74rem;
  }

  .load-more {
    width: 100%;
    justify-content: center;
    font-size: 0.75rem;
  }

  .btn-en,
  .btn-sep {
    display: none;
  }
}
</style>
