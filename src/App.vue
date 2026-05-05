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
  MORNING: 1,
  EVENING: 2,
  NIGHT: 3,
} as const;

const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"] as const;
const SHIFT_SLOT_LABELS = ["08:00–16:00", "16:00–24:00", "24:00–08:00"] as const;

const scheduleData = ref<MonthSchedule[]>([]);
const workIntervals = ref<WorkInterval[]>([]);
const now = ref(new Date());
const isLoading = ref(true);
const displayDays = ref(5);

function processShifts(data: MonthSchedule[]) {
  const intervals: WorkInterval[] = [];
  data.forEach((monthData) => {
    monthData.shifts.forEach((shift) => {
      if (typeof shift.value !== "number") return;

      const year = monthData.year;
      const month = monthData.month - 1;
      const day = shift.date;
      let start: Date;
      let end: Date;

      if (shift.value === SHIFT_TYPES.MORNING) {
        start = new Date(year, month, day, 8, 0, 0);
        end = new Date(year, month, day, 16, 0, 0);
      } else if (shift.value === SHIFT_TYPES.EVENING) {
        const nextDay = new Date(year, month, day);
        nextDay.setDate(nextDay.getDate() + 1);
        start = new Date(year, month, day, 16, 0, 0);
        end = new Date(
          nextDay.getFullYear(),
          nextDay.getMonth(),
          nextDay.getDate(),
          0,
          0,
          0
        );
      } else if (shift.value === SHIFT_TYPES.NIGHT) {
        start = new Date(year, month, day, 0, 0, 0);
        end = new Date(year, month, day, 8, 0, 0);
      } else {
        return;
      }

      intervals.push({ start, end });
    });
  });

  return intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function getDisplayDaysForWidth(width: number) {
  if (width >= 2400) return 10;
  if (width >= 1600) return 8;
  if (width >= 1024) return 7;
  if (width >= 640) return 5;
  return 4;
}

function updateDisplayDaysForViewport() {
  if (typeof window === "undefined") return;
  displayDays.value = getDisplayDaysForWidth(window.innerWidth);
}

function formatAbsoluteDate(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(
    date.getHours()
  ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

onMounted(async () => {
  updateDisplayDaysForViewport();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", updateDisplayDaysForViewport);
  }

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

  setInterval(() => {
    now.value = new Date();
  }, 1000);

  setInterval(() => {
    fetch(import.meta.env.BASE + "data/panda.json")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        scheduleData.value = data;
        workIntervals.value = processShifts(data);
      })
      .catch((e) => console.error("Failed to reload schedule data:", e));
  }, 60000);
});

const activeShift = computed(() =>
  workIntervals.value.find(
    (interval) =>
      now.value.getTime() >= interval.start.getTime() &&
      now.value.getTime() < interval.end.getTime()
  )
);

const nextShift = computed(() =>
  workIntervals.value.find((interval) => interval.start.getTime() > now.value.getTime())
);

const currentStatus = computed(() => (activeShift.value ? "在上班" : "在休息"));
const currentStatusBadge = computed(() => {
  if (isLoading.value) return "同步中";
  return activeShift.value ? "上班中" : "休息中";
});
const availabilityStatus = computed(() => {
  if (isLoading.value) return "判斷中...";
  return activeShift.value ? "暫時忙碌" : "可聯絡";
});

const shiftTimeInfo = computed(() => {
  if (activeShift.value) {
    return `預計 ${formatTime(activeShift.value.end)} 後較方便`;
  }

  if (!nextShift.value) return "目前沒有後續班表";

  return `可聯絡到 ${formatTime(nextShift.value.start)}`;
});

const nextShiftDetail = computed(() => {
  if (activeShift.value) {
    return `目前：${currentStatus.value}｜${formatAbsoluteDate(activeShift.value.end)} 下班`;
  }
  if (nextShift.value) {
    return `目前：${currentStatus.value}｜${formatAbsoluteDate(nextShift.value.start)} 開始上班`;
  }
  return `目前：${currentStatus.value}`;
});

const currentTimeLabel = computed(() => formatTime(now.value));

const nextChangeLabel = computed(() => {
  if (activeShift.value) {
    return `${formatTime(activeShift.value.end)} 下班`;
  }
  if (nextShift.value) {
    return `${formatTime(nextShift.value.start)} 上班`;
  }
  return "暫無後續資料";
});

type Status = "WORK" | "REST" | "UNKNOWN";

function shiftLabel(shiftType: Status, slotIndex: number): string {
  const time = SHIFT_SLOT_LABELS[slotIndex] ?? "";
  const status =
    shiftType === "WORK" ? "上班中" : shiftType === "REST" ? "休息中" : "未知";
  return `${time} ${status}`;
}

function shiftBadgeText(shiftType: Status) {
  return shiftType === "WORK" ? "上班" : shiftType === "REST" ? "休息" : "未知";
}

const loadMore = () => {
  displayDays.value += 3;
};

const scheduleForDisplay = computed(() => {
  if (!scheduleData.value.length) return [];

  const today = new Date();
  if (now.value.getHours() < 8) today.setDate(today.getDate() - 1);

  const result = [];

  for (let i = 0; i < displayDays.value; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dow = date.getDay();

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
    const ndy = nextDay.getFullYear();
    const ndm = nextDay.getMonth() + 1;
    const ndd = nextDay.getDate();
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

const hasUnknownVisible = computed(() =>
  scheduleForDisplay.value.some((day) => day.shifts.includes("UNKNOWN"))
);

const timelineStyle = computed((): CSSProperties => {
  const current = now.value;
  const today8AM = new Date(current);
  today8AM.setHours(8, 0, 0, 0);
  if (current.getTime() < today8AM.getTime()) {
    today8AM.setDate(today8AM.getDate() - 1);
  }
  const minutesSince8AM = (current.getTime() - today8AM.getTime()) / (1000 * 60);
  const percent = Math.max(0, Math.min(100, (minutesSince8AM / (24 * 60)) * 100));
  return { left: `${percent}%` };
});
</script>

<template>
  <div class="container">
    <header class="header">
      <div class="eyebrow">PANDA STATUS TRACKER</div>
      <h1 class="title">現在在上班嗎？</h1>
    </header>

    <section
      class="status-panel"
      :class="{ 'on-duty': currentStatus === '在上班' }"
      role="status"
      :aria-label="`目前狀態：${isLoading ? '讀取中' : currentStatus}`"
    >
      <div class="status-main">
        <div class="status-copy">
          <div class="status-pill">
            <span class="status-dot" aria-hidden="true"></span>
            <span>{{ currentStatusBadge }}</span>
          </div>
          <div class="status-zh">{{ isLoading ? "讀取中..." : availabilityStatus }}</div>
          <p class="countdown" aria-live="off">{{ isLoading ? "資料讀取中" : shiftTimeInfo }}</p>
          <p class="next-shift-detail">{{ isLoading ? "正在取得班表資料" : nextShiftDetail }}</p>
        </div>

        <div class="status-metrics" aria-label="輔助資訊">
          <div class="metric-card">
            <span class="metric-label">目前時間</span>
            <strong class="metric-value">{{ currentTimeLabel }}</strong>
          </div>
          <div class="metric-card">
            <span class="metric-label">下一次變化</span>
            <strong class="metric-value">{{ nextChangeLabel }}</strong>
          </div>
        </div>
      </div>
    </section>

    <section class="schedule-shell" aria-labelledby="schedule-heading">
      <div class="schedule-head">
        <div>
          <p class="section-kicker">近期待班</p>
          <h2 id="schedule-heading">近期班表</h2>
        </div>

        <div class="legend" aria-label="圖例">
          <span class="legend-item">
            <span class="legend-swatch work" aria-hidden="true"></span>
            <span>上班</span>
          </span>
          <span class="legend-item">
            <span class="legend-swatch rest" aria-hidden="true"></span>
            <span>休息</span>
          </span>
          <span v-if="hasUnknownVisible" class="legend-item">
            <span class="legend-swatch unknown" aria-hidden="true"></span>
            <span>未知</span>
          </span>
        </div>
      </div>

      <section class="schedule-container" role="region" aria-label="Panda 的班表時間表">
        <div class="section-axis" aria-hidden="true">
          <span class="section-today">今日</span>
          <span class="section-d1">次日</span>
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
                  work: shiftType === 'WORK',
                  rest: shiftType === 'REST',
                  unknown: shiftType === 'UNKNOWN',
                }"
                role="gridcell"
              >
                <span class="shift-badge" aria-hidden="true">{{ shiftBadgeText(shiftType) }}</span>
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

      <div class="schedule-footer">
        <p class="footer-note">需要更長的歷史區間時，可繼續展開更多天數。</p>
        <button class="load-more" @click="loadMore" aria-label="載入更多班表資料">
          <span class="btn-zh">再看 3 天</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
@keyframes breathe-soft {
  0%, 100% {
    box-shadow: 0 0 0 1px rgba(0, 245, 255, 0.08), 0 14px 40px rgba(0, 0, 0, 0.32);
  }
  50% {
    box-shadow: 0 0 0 1px rgba(0, 245, 255, 0.18), 0 18px 48px rgba(0, 0, 0, 0.38);
  }
}

@keyframes pulse-line {
  0%, 100% {
    opacity: 0.95;
    box-shadow: 0 0 10px rgba(255, 31, 75, 0.38);
  }
  50% {
    opacity: 0.7;
    box-shadow: 0 0 18px rgba(255, 31, 75, 0.58);
  }
}

.container {
  --panel-px: clamp(1rem, 2vw, 2.25rem);
  position: relative;
  max-width: 1180px;
  margin: 0 auto;
  padding: clamp(1.25rem, 2vw, 2rem) var(--panel-px) clamp(1.5rem, 2vw, 2.25rem);
  background: linear-gradient(180deg, rgba(17, 17, 42, 0.96), rgba(9, 9, 22, 0.98));
  border: 1px solid rgba(76, 100, 168, 0.38);
  border-radius: 24px;
  box-shadow:
    0 0 0 1px rgba(0, 245, 255, 0.06) inset,
    0 24px 90px rgba(0, 0, 0, 0.5);
}

.container::before,
.container::after {
  content: "";
  position: absolute;
  top: 14px;
  width: 28px;
  height: 28px;
  border-top: 2px solid rgba(0, 245, 255, 0.75);
}

.container::before {
  left: 14px;
  border-left: 2px solid rgba(0, 245, 255, 0.75);
}

.container::after {
  right: 14px;
  border-right: 2px solid rgba(0, 245, 255, 0.75);
}

.header {
  display: grid;
  gap: 0.3rem;
  margin-bottom: 0.9rem;
  text-align: left;
}

.eyebrow {
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--c-text-secondary);
}

.title {
  margin: 0;
  font-size: clamp(1.8rem, 3.6vw, 3rem);
  line-height: 1.08;
  letter-spacing: 0.01em;
  color: var(--c-text-primary);
}

.subtitle {
  margin: 0;
  max-width: 42rem;
  color: var(--c-text-secondary);
  font-size: 0.98rem;
}

.status-panel {
  margin-bottom: 0.95rem;
  padding: clamp(0.85rem, 1.6vw, 1.15rem);
  border: 1px solid rgba(57, 255, 20, 0.28);
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(57, 255, 20, 0.05), rgba(0, 245, 255, 0.025)),
    rgba(15, 16, 36, 0.92);
}

.status-panel.on-duty {
  border-color: rgba(255, 124, 0, 0.34);
  background:
    linear-gradient(135deg, rgba(255, 124, 0, 0.06), rgba(0, 245, 255, 0.025)),
    rgba(15, 16, 36, 0.92);
}

.status-main {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(260px, 0.95fr);
  gap: 0.8rem;
  align-items: stretch;
}

.status-copy {
  display: grid;
  gap: 0.3rem;
  align-content: center;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  width: fit-content;
  min-height: 32px;
  padding: 0.28rem 0.7rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--c-text-secondary);
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--c-neon-green);
  box-shadow: 0 0 10px rgba(57, 255, 20, 0.65);
}

.status-panel.on-duty .status-dot {
  background: var(--c-neon-orange);
  box-shadow: 0 0 12px rgba(255, 124, 0, 0.65);
}

.status-zh {
  font-size: clamp(2.05rem, 4.9vw, 3.4rem);
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.03em;
  color: var(--c-neon-green);
}

.status-panel.on-duty .status-zh {
  color: var(--c-neon-orange);
}

.countdown {
  margin: 0;
  font-size: clamp(0.98rem, 1.55vw, 1.16rem);
  font-weight: 700;
  color: var(--c-text-primary);
  font-variant-numeric: tabular-nums;
}

.next-shift-detail {
  margin: 0;
  color: var(--c-text-secondary);
  font-size: 0.92rem;
}

.status-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
  align-self: center;
}

.metric-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.2rem;
  padding: 0.62rem 0.75rem;
  border-radius: 16px;
  background: rgba(4, 8, 20, 0.38);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.metric-label {
  color: var(--c-text-secondary);
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.metric-value {
  color: var(--c-text-primary);
  font-size: clamp(0.95rem, 1.15vw, 1.08rem);
  line-height: 1.15;
}

.schedule-shell {
  display: grid;
  gap: 0.75rem;
}

.schedule-head {
  display: flex;
  gap: 0.75rem;
  align-items: end;
  justify-content: space-between;
  flex-wrap: wrap;
}

.section-kicker {
  margin: 0 0 0.15rem;
  color: var(--c-neon-cyan);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.schedule-head h2 {
  margin: 0;
  font-size: clamp(1.28rem, 1.8vw, 1.75rem);
  color: var(--c-text-primary);
}

.schedule-container {
  --date-label-w: 88px;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(76, 100, 168, 0.34);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(6, 9, 22, 0.96), rgba(6, 6, 14, 0.98));
}

.section-axis {
  display: grid;
  grid-template-columns: 2fr 1fr;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.section-today,
.section-d1 {
  padding: 0.7rem 1rem;
  text-align: center;
}

.section-today {
  color: var(--c-neon-cyan);
  background: rgba(0, 245, 255, 0.06);
  border-bottom: 1px solid rgba(0, 245, 255, 0.2);
}

.section-d1 {
  color: #ff7bd8;
  background: rgba(255, 0, 204, 0.06);
  border-left: 1px solid rgba(76, 100, 168, 0.34);
  border-bottom: 1px solid rgba(255, 0, 204, 0.18);
}

.time-axis {
  position: relative;
  height: 2.4rem;
  border-bottom: 1px solid rgba(76, 100, 168, 0.3);
  color: var(--c-text-secondary);
}

.time-axis span {
  position: absolute;
  top: 0.7rem;
  font-size: 0.92rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.time-axis .time-mark.start { left: 1rem; }
.time-axis .time-mark.mid-1 { left: 33.333%; transform: translateX(-50%); }
.time-axis .time-mark.mid-2 { left: 66.666%; transform: translateX(-50%); }
.time-axis .time-mark.end { right: 1rem; }

.schedule-grid {
  position: relative;
}

.day-row {
  position: relative;
  display: flex;
  min-height: 88px;
  border-bottom: 1px solid rgba(76, 100, 168, 0.22);
}

.day-row:last-child {
  border-bottom: none;
}

.day-row.today {
  background: linear-gradient(90deg, rgba(0, 245, 255, 0.06), transparent 18%);
}

.date-label {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 2;
  width: var(--date-label-w);
  display: grid;
  place-content: center;
  gap: 0.28rem;
  background: rgba(5, 8, 18, 0.88);
  border-right: 1px solid rgba(0, 245, 255, 0.18);
}

.date-md {
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1;
  color: var(--c-text-primary);
  font-variant-numeric: tabular-nums;
}

.date-dow {
  font-size: 0.84rem;
  line-height: 1;
  color: #a9acd8;
}

.date-dow.weekend {
  color: #ff7bd8;
}

.shifts {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  min-height: 88px;
  position: relative;
}

.shift-block {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 0.75rem;
  border-right: 1px solid rgba(76, 100, 168, 0.22);
}

.shift-block:last-child {
  border-right: none;
}

.shift-block.work {
  background: rgba(255, 124, 0, 0.18);
}

.shift-block.rest {
  background: rgba(57, 255, 20, 0.11);
}

.shift-block.unknown {
  background: rgba(92, 96, 143, 0.16);
}

.shift-badge {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: rgba(4, 8, 20, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--c-text-primary);
  font-size: 0.72rem;
  font-weight: 700;
}

.timeline-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(255, 31, 75, 0.78);
  transform: translateX(-50%);
  z-index: 3;
  opacity: 0.85;
}

.now-label {
  position: absolute;
  top: 0.5rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.14rem 0.34rem;
  border-radius: 999px;
  background: rgba(255, 31, 75, 0.1);
  color: #ffd7df;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  justify-content: flex-end;
  align-items: center;
  color: var(--c-text-secondary);
  font-size: 0.92rem;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.legend-swatch {
  width: 24px;
  height: 14px;
  border-radius: 999px;
}

.legend-swatch.work {
  background: linear-gradient(90deg, rgba(255, 124, 0, 0.92), rgba(255, 165, 79, 0.6));
}

.legend-swatch.rest {
  background: linear-gradient(90deg, rgba(57, 255, 20, 0.85), rgba(124, 255, 103, 0.5));
}

.legend-swatch.unknown {
  background: linear-gradient(90deg, rgba(99, 109, 193, 0.75), rgba(69, 72, 109, 0.66));
}

.schedule-footer {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.footer-note {
  margin: 0;
  color: var(--c-text-secondary);
  font-size: 0.92rem;
}

.load-more {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0.72rem 1.1rem;
  border-radius: 14px;
  border: 1px solid rgba(0, 245, 255, 0.28);
  background: rgba(0, 245, 255, 0.05);
  color: var(--c-neon-cyan);
  font-size: 0.9rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  transition: 0.18s ease;
}

.load-more:hover {
  background: rgba(0, 245, 255, 0.11);
  border-color: rgba(0, 245, 255, 0.55);
  box-shadow: 0 8px 24px rgba(0, 245, 255, 0.12);
}

.load-more:active {
  transform: translateY(1px);
}

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

@media (min-width: 1500px) {
  .container {
    max-width: 1480px;
  }

  .status-main {
    grid-template-columns: minmax(0, 2fr) minmax(440px, 1fr);
  }

  .day-row,
  .shifts {
    min-height: 94px;
  }
}

@media (min-width: 2400px) {
  .container {
    max-width: 2280px;
  }

  .title {
    font-size: 2.9rem;
  }

  .status-panel {
    padding: 0.9rem 1.05rem;
  }

  .status-zh {
    font-size: 3.75rem;
  }

  .schedule-shell {
    gap: 0.65rem;
  }

  .schedule-container {
    --date-label-w: 100px;
  }

  .day-row,
  .shifts {
    min-height: 96px;
  }
}

@media (max-width: 1024px) {
  .header {
    margin-bottom: 0.8rem;
  }

  .status-main {
    grid-template-columns: 1fr;
  }

  .status-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .schedule-head,
  .schedule-footer {
    align-items: start;
  }
}

@media (max-width: 720px) {
  .container {
    border-radius: 18px;
  }

  .contact-advice,
  .subtitle,
  .section-desc,
  .footer-note {
    font-size: 0.95rem;
  }

  .status-metrics {
    grid-template-columns: 1fr;
  }

  .metric-card {
    padding: 0.58rem 0.72rem;
  }

  .schedule-container {
    --date-label-w: 74px;
  }

  .section-axis {
    font-size: 0.74rem;
  }

  .time-axis {
    height: 2rem;
  }

  .time-axis span {
    top: 0.52rem;
    font-size: 0.8rem;
  }

  .day-row,
  .shifts {
    min-height: 76px;
  }

  .shift-block {
    padding: 0.55rem 0.4rem;
  }

  .shift-badge {
    font-size: 0.74rem;
    padding: 0.15rem 0.45rem;
  }

  .legend {
    justify-content: flex-start;
  }
}

@media (max-width: 480px) {
  .container {
    --panel-px: 0.9rem;
    padding-top: 1rem;
    border-radius: 14px;
  }

  .container::before,
  .container::after {
    width: 18px;
    height: 18px;
    top: 10px;
  }

  .eyebrow {
    font-size: 0.74rem;
  }

  .title {
    font-size: 1.64rem;
  }

  .status-panel {
    padding: 0.78rem;
  }

  .status-zh {
    font-size: 2.08rem;
  }

  .countdown {
    font-size: 1rem;
  }

  .next-shift-detail {
    font-size: 0.86rem;
  }

  .schedule-container {
    --date-label-w: 64px;
  }

  .date-md {
    font-size: 0.84rem;
  }

  .date-dow {
    font-size: 0.74rem;
  }

  .time-axis span {
    font-size: 0.72rem;
  }

  .btn-en,
  .btn-sep {
    display: none;
  }

  .btn-zh {
    white-space: nowrap;
  }

  .load-more {
    width: 100%;
    justify-content: center;
  }

  .shift-badge {
    display: none;
  }
}

@media (max-height: 820px) and (min-width: 960px) {
  .container {
    padding-top: 1rem;
    padding-bottom: 1.15rem;
  }

  .header {
    gap: 0.22rem;
    margin-bottom: 0.72rem;
  }

  .title {
    font-size: clamp(1.9rem, 3.2vw, 2.65rem);
  }

  .subtitle {
    font-size: 0.93rem;
  }

  .status-panel {
    margin-bottom: 0.64rem;
    padding: 0.64rem 0.76rem;
  }

  .status-main {
    gap: 0.65rem;
  }

  .status-zh {
    font-size: clamp(2rem, 4vw, 3rem);
  }

  .countdown {
    font-size: 1rem;
  }

  .next-shift-detail {
    font-size: 0.88rem;
  }

  .metric-card {
    padding: 0.56rem 0.68rem;
  }

  .schedule-shell {
    gap: 0.62rem;
  }

  .section-desc {
    font-size: 0.9rem;
  }

  .day-row,
  .shifts {
    min-height: 78px;
  }

  .shift-block {
    padding: 0.58rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
</style>
