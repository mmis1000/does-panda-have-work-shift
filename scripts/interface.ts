export interface Shift {
  date: number,
  value: any
}

export interface ShiftData {
  name: string,
  shifts: Shift[]
}

export interface MonthData {
  year: number,
  month: number,
  data: ShiftData[]
}

export interface FilteredMonthData {
  year: number,
  month: number,
  shifts: Shift[]
}

