import * as XLSX from "xlsx";

/* load 'fs' for readFile and writeFile support */
import * as fs from "fs";
XLSX.set_fs(fs);

/* load 'stream' for stream support */
import { Readable } from "stream";
XLSX.stream.set_readable(Readable);

/* load the codepage support library for extended support with older formats  */
// @ts-ignore
import * as cpexcel from "xlsx/dist/cpexcel.full.mjs";
XLSX.set_cptable(cpexcel);

// Import type definitions
import type { MonthData, FilteredMonthData } from "./interface";
import path from "path";

const filenameArg = process.argv[2];
if (!filenameArg) {
  console.error("Please provide a filename as an argument");
  process.exit(1);
}

const outputFilenameArg = process.argv[3];
if (!outputFilenameArg) {
  console.error("Please provide an output filename as an argument");
  process.exit(1);
}

const filterUser = process.argv[4];
if (!filterUser) {
  console.error(
    'Please provide a user to filter as an argument or use "all" to not filter'
  );
  process.exit(1);
}

const filenames = filenameArg
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const outputFilenames = outputFilenameArg
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

if (filenames.length === 0) {
  console.error("At least one filename is required");
  process.exit(1);
}

if (outputFilenames.length !== 1) {
  console.error("Exactly one output filename is required");
  process.exit(1);
}

const rootDir = process.cwd();
const resolvedOutput = path.resolve(rootDir, outputFilenames[0]);
const combinedMonthData: MonthData[] = [];

filenames.forEach((inputFilename) => {
  const resolvedInput = path.resolve(rootDir, inputFilename);
  const year = inputFilename.match(/(\d{4})/)?.[1] ?? "";

  if (!year) {
    console.error("Filename must contain a year");
    process.exit(1);
  }

  const workbook = XLSX.readFile(resolvedInput, { cellStyles: true });
  const monthData: MonthData[] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];

    const row = XLSX.utils.decode_cell("A3").r;
    const headerRow = row - 1;
    const sheetRange = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    let col = -1;

    for (let c = sheetRange.s.c; c <= sheetRange.e.c; c++) {
      const cell = XLSX.utils.encode_cell({ r: headerRow, c });
      const value = sheet[cell]?.v;
      if (typeof value === "string" && value.includes("月")) {
        col = c;
        break;
      }
    }

    if (col === -1) {
      throw new Error(`Unable to find the month header in sheet ${sheetName}`);
    }

    let names: any[] = [];
    let nameRowEnd = row + 1;
    {
      let continueRead = true;

      do {
        const cell = XLSX.utils.encode_cell({ r: nameRowEnd, c: col });
        const data: XLSX.CellObject = sheet[cell];
        if (data.s?.bgColor != null) {
          names.push(data.v);
        } else {
          continueRead = false;
        }
        nameRowEnd++;
      } while (continueRead);
    }

    const weekdayLabels = new Set(["日", "一", "二", "三", "四", "五", "六"]);
    let dateColStart = col + 1;

    while (dateColStart <= sheetRange.e.c) {
      const cell = XLSX.utils.encode_cell({ r: row, c: dateColStart });
      if (Number(sheet[cell]?.v) === 1) {
        break;
      }
      dateColStart++;
    }

    if (dateColStart > sheetRange.e.c) {
      throw new Error(`Unable to find day 1 in sheet ${sheetName}`);
    }

    const dates: number[] = [];
    let dateColEnd = dateColStart;
    {
      let continueRead = true;
      do {
        const dateCell = XLSX.utils.encode_cell({ r: row, c: dateColEnd });
        const weekdayCell = XLSX.utils.encode_cell({
          r: headerRow,
          c: dateColEnd,
        });
        const dateValue = sheet[dateCell]?.v;
        const weekdayValue = sheet[weekdayCell]?.v;
        const validDate = dateValue != null && !isNaN(Number(dateValue));
        const validWeekday =
          typeof weekdayValue === "string" && weekdayLabels.has(weekdayValue);

        if (validDate || validWeekday) {
          const inferredDate = dates.length + 1;
          if (!validDate || !validWeekday) {
            console.warn(
              `Invalid calendar header in ${sheetName} at ${dateCell}/${weekdayCell}; using day ${inferredDate}`
            );
          }
          dates.push(inferredDate);
        } else {
          continueRead = false;
        }
        dateColEnd++;
      } while (continueRead);
    }

    const data: {
      name: string;
      shifts: {
        date: number;
        value: any;
      }[];
    }[] = [];

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const shifts: {
        date: number;
        value: any;
      }[] = [];
      for (let j = 0; j < dates.length; j++) {
        const date = dates[j];
        const cell = XLSX.utils.encode_cell({
          r: row + i + 1,
          c: dateColStart + j,
        });
        const data: XLSX.CellObject = sheet[cell];
        const value = data.v;
        shifts.push({
          date,
          value,
        });
      }
      data.push({
        name,
        shifts,
      });
    }

    monthData.push({
      year: Number(year),
      month: Number(sheetName),
      data,
    });
  });

  combinedMonthData.push(...monthData);
});

fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
if (filterUser === "all") {
  const file = JSON.stringify(combinedMonthData, undefined, 2);
  fs.writeFileSync(resolvedOutput, file);
} else {
  const filteredMonthData: FilteredMonthData[] = combinedMonthData.map(
    (month) => {
      return {
        year: month.year,
        month: month.month,
        shifts: (
          month.data.find((shiftData) => {
            return shiftData.name === filterUser;
          }) ?? {
            name: filterUser,
            shifts: [],
          }
        ).shifts,
      };
    }
  );

  const file = JSON.stringify(filteredMonthData, undefined, 2);
  fs.writeFileSync(resolvedOutput, file);
}
