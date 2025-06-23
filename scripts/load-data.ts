import * as XLSX from 'xlsx';

/* load 'fs' for readFile and writeFile support */
import * as fs from 'fs';
XLSX.set_fs(fs);

/* load 'stream' for stream support */
import { Readable } from 'stream';
XLSX.stream.set_readable(Readable);

/* load the codepage support library for extended support with older formats  */
// @ts-ignore
import * as cpexcel from 'xlsx/dist/cpexcel.full.mjs';
XLSX.set_cptable(cpexcel);

// Import type definitions
import type { MonthData, FilteredMonthData } from './interface';
import path from 'path';

const filename = process.argv[2];
if (!filename) {
  console.error('Please provide a filename as an argument');
  process.exit(1);
}

const year = filename.match(/(\d{4})/)?.[1] ?? ''
if (!year) {
  console.error('Filename must contain a year');
  process.exit(1);
}

const outputFilename = process.argv[3];
if (!outputFilename) {
  console.error('Please provide an output filename as an argument');
  process.exit(1);
}

const filterUser = process.argv[4];
if (!filterUser) {
  console.error('Please provide a user to filter as an argument or use "all" to not filter');
  process.exit(1);
}

const workbook = XLSX.readFile(filename, { cellStyles: true });
// console.log(workbook);

const monthData: MonthData[] = []

workbook.SheetNames.forEach((sheetName) => {
  const sheet = workbook.Sheets[sheetName];

  const dataEdge = 'J3'
  const dataEdgePos = XLSX.utils.decode_cell(dataEdge)
  const row = dataEdgePos.r
  const col = dataEdgePos.c

  let names: any[] = []
  let nameRowEnd = row + 1
  {
    let continueRead = true

    do {
      const cell = XLSX.utils.encode_cell({ r: nameRowEnd, c: col })
      const data: XLSX.CellObject = sheet[cell]
      if (data.s?.bgColor != null) {
        names.push(data.v)
      } else {
        continueRead = false
      }
      nameRowEnd++
    } while (continueRead)
  }

  let dates: any[] = []
  let dateColEnd = col + 1
  {
    let continueRead = true
    do {
      const cell = XLSX.utils.encode_cell({ r: row, c: dateColEnd })
      const data: XLSX.CellObject = sheet[cell]
      if (!isNaN(Number(data.v))) {
        dates.push(data.v)
      } else {
        continueRead = false
      }
      dateColEnd++
    } while (continueRead)
  }

  const data: {
    name: string,
    shifts: {
      date: number,
      value: any
    }[]
  }[] = []

  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    const shifts: {
      date: number,
      value: any
    }[] = []
    for (let j = 0; j < dates.length; j++) {
      const date = dates[j]
      const cell = XLSX.utils.encode_cell({ r: row + i + 1, c: col + j + 1 })
      const data: XLSX.CellObject = sheet[cell]
      const value = data.v
      shifts.push({
        date,
        value
      })
    }
    data.push({
      name,
      shifts
    })
  }

  monthData.push({
    year: Number(year),
    month: Number(sheetName),
    data
  })
});

fs.mkdirSync(path.dirname(outputFilename), { recursive: true })
if (filterUser === 'all') {
  const file = JSON.stringify(monthData, undefined, 2)
  fs.writeFileSync(outputFilename, file)
} else {
  const filteredMonthData: FilteredMonthData[] = monthData.map((month) => {
    return {
      year: Number(year),
      month: month.month,
      shifts: (month.data.find((shiftData) => {
        return shiftData.name === filterUser
      }) ?? {
        name: filterUser,
        shifts: []
      }).shifts
    }
  })

  const file = JSON.stringify(filteredMonthData, undefined, 2)
  fs.writeFileSync(outputFilename, file)
}