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
  NIGHT: 3, // 大夜 (2400-0800)
} as const;

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
          // 早班 08-16
          start = new Date(year, month, day, 8, 0, 0);
          end = new Date(year, month, day, 16, 0, 0);
        } else if (shift.value === SHIFT_TYPES.EVENING) {
          // 晚班 16-24
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
          // 大夜 00-08
          start = new Date(year, month, day, 0, 0, 0);
          end = new Date(year, month, day, 8, 0, 0);
        } else {
          return;
        }
        intervals.push({ start, end });
      }
    });
  });
  // Sort intervals by start time
  return intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
}

onMounted(async () => {
  try {
    const response = await fetch(import.meta.env.BASE + "data/panda.json");
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
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
});

const activeShift = computed(() => {
  const currentTime = now.value.getTime();
  return workIntervals.value.find(
    (interval) =>
      currentTime >= interval.start.getTime() &&
      currentTime < interval.end.getTime()
  );
});

const currentStatus = computed(() => {
  return activeShift.value ? "在上班" : "在休息";
});

const shiftTimeInfo = computed(() => {
  const currentTime = now.value.getTime();

  if (activeShift.value) {
    // Currently on duty, show time until shift ends
    const diff = activeShift.value.end.getTime() - currentTime;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `距離下班還有：${hours}h ${minutes}min`;
  } else {
    // Currently resting, find next shift
    const nextShift = workIntervals.value.find(
      (interval) => interval.start.getTime() > currentTime
    );

    if (!nextShift) {
      return "沒有更多班表資訊";
    }

    const diff = nextShift.start.getTime() - currentTime;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `離下次上班還有：${hours}h ${minutes}min`;
  }
});

type Status = "WORK" | "REST" | "UNKNOWN";

const displayDays = ref(5)
const loadMore = () => {
  displayDays.value += 5;
}

const scheduleForDisplay = computed(() => {
  if (!scheduleData.value.length) return [];

  const today = new Date();

  // If it's before 8 AM, we should consider "today" as the previous day for schedule purposes
  if (now.value.getHours() < 8) {
    today.setDate(today.getDate() - 1);
  }

  const result = [];

  for (let i = 0; i < displayDays.value; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const monthData = scheduleData.value.find(
      (m) => m.year === year && m.month === month
    );
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
    const nextDayYear = nextDay.getFullYear();
    const nextDayMonth = nextDay.getMonth() + 1;
    const nextDayDay = nextDay.getDate();
    const monthDataNextDay = scheduleData.value.find(
      (m) => m.year === nextDayYear && m.month === nextDayMonth
    );
    const shiftNextDay = monthDataNextDay?.shifts.find(
      (s) => s.date === nextDayDay
    );
    const shiftColorNextDay =
      shiftNextDay == null
        ? (["UNKNOWN"] as const)
        : shiftNextDay.value === SHIFT_TYPES.NIGHT
        ? (["WORK"] as const)
        : (["REST"] as const);

    const shifts: [Status, Status, Status] = [
      ...shiftColor,
      ...shiftColorNextDay,
    ];

    result.push({
      dateLabel: `${String(month).padStart(2, "0")}/${String(day).padStart(
        2,
        "0"
      )}`,
      shifts,
    });
  }
  return result;
});

const timelineStyle = computed((): CSSProperties => {
  const now_ = now.value;

  const today8AM = new Date(now_);
  today8AM.setHours(8, 0, 0, 0);

  // If current time is before 8 AM, the reference is yesterday's 8 AM
  if (now_.getTime() < today8AM.getTime()) {
    today8AM.setDate(today8AM.getDate() - 1);
  }

  const minutesSince8AM = (now_.getTime() - today8AM.getTime()) / (1000 * 60);
  const totalMinutesInCycle = 24 * 60;
  const percent = Math.max(
    0,
    Math.min(100, (minutesSince8AM / totalMinutesInCycle) * 100)
  );

  return {
    left: `${percent}%`,
  };
});
</script>

<template>
  <div class="container">
    <h1 class="title">
      Panda <span style="white-space: nowrap">現在在上班嗎？</span>
    </h1>
    <h2 class="status" :class="{ 'on-duty': currentStatus === '在上班' }">
      {{ isLoading ? "讀取中..." : currentStatus }}
    </h2>
    <p class="countdown">{{ isLoading ? "" : shiftTimeInfo }}</p>

    <div class="schedule-container">
      <div class="time-axis">
        <span class="time-mark start">08:00</span>
        <span class="time-mark mid-1">16:00</span>
        <span class="time-mark mid-2">24:00</span>
        <span class="time-mark end">08:00</span>
        <span class="day-mark">D+1</span>
      </div>
      <div class="schedule-grid">
        <div
          v-for="(day, index) in scheduleForDisplay"
          :key="day.dateLabel"
          class="day-row"
        >
          <div class="date-label">{{ day.dateLabel }}</div>
          <div class="shifts">
            <div
              v-for="shiftType of day.shifts"
              :key="shiftType"
              class="shift-block"
              :class="{
                work: shiftType === 'WORK',
                rest: shiftType === 'REST',
                unknown: shiftType === 'UNKNOWN',
              }"
            ></div>
            <div
              v-if="index === 0"
              class="timeline-indicator"
              :style="timelineStyle"
            ></div>
          </div>
        </div>
      </div>
    </div>
    <button class="load-more" @click="loadMore">Load More</button>
  </div>
</template>

<style scoped>
:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

.title {
  font-size: 2.5rem;
  font-weight: bold;
  line-height: 1.4;
  margin-bottom: 1rem;
}

.status {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: #50fa7b;
  /* Green for rest */
}

.status.on-duty {
  color: #ff5555;
  /* Red for on-duty */
}

.countdown {
  font-size: 1.2rem;
  color: #8be9fd;
  margin-bottom: 3rem;
}

.schedule-container {
  width: calc(100% + 50px);
  position: relative;
  margin-left: -50px;
}

.time-axis {
  position: relative;
  height: 1.5em;
  margin-left: calc(50px + 1px);
  /* date-label-width + date-label-border */
  margin-bottom: 0.5rem;
  color: #6272a4;
}

.time-axis span {
  position: absolute;
  font-size: 0.9em;
}

.time-axis .time-mark.start {
  left: 0%;
  transform: translateX(0);
}

.time-axis .time-mark.mid-1 {
  left: 33.333%;
  transform: translateX(-50%);
}

.time-axis .time-mark.mid-2 {
  left: 66.666%;
  transform: translateX(-50%);
}

.time-axis .time-mark.end {
  left: 100%;
  transform: translateX(-100%);
}

.time-axis .day-mark {
  left: 83.333%;
  transform: translateX(-50%);
  color: #8be9fd;
}

.schedule-grid {
  position: relative;
  border-right: 1px solid #44475a;
}

.schedule-grid::before {
  content: "";
  position: absolute;
  top: 0;
  left: calc(50px + 1px);
  right: 0;
  height: 1px;
  background-color: #44475a;
}

.day-row {
  display: flex;
  align-items: center;
  position: relative;
}

.day-row::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: calc(50px + 1px);
  right: 0;
  height: 1px;
  background-color: #44475a;
}

.date-label {
  width: 50px;
  padding: 1rem 0;
  text-align: center;
  color: #6272a4;
  border-right: 1px solid #44475a;
  flex-shrink: 0;
}

.shifts {
  flex-grow: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  position: relative;
}

.shift-block {
  height: 40px;
  border-right: 1px solid #44475a;
}

.shift-block:last-child {
  border-right: none;
}

.work {
  background-color: #ffb86c;
  /* Orange/Pink-ish */
}

.rest {
  background-color: #50fa7b;
  /* Green */
}

.unknown {
  background-color: #6272a4;
}

.timeline-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: red;
  transform: translateX(-50%);
  z-index: 10;
}

.load-more {
  margin: 1.5rem auto 0;
  padding: 0.75rem 2.5rem;
  border: 1px solid #8be9fd;
  border-radius: 999px;
  background: transparent;
  color: #f8f8f2;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
}

.load-more:hover {
  background-color: #8be9fd;
  color: #282a36;
  box-shadow: 0 0 12px rgba(139, 233, 253, 0.5);
}

.load-more:active {
  transform: scale(0.98);
}
</style>
