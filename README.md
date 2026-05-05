# Does panda have work shift today

far eastone employee will know

## Local setup

```bash
npm install
npm run update-data
npm run dev
```

Data-fetching scripts automatically load values from `.env` when it exists.

Current `.env` values:

```dotenv
SOURCE_URL="https://github.com/JasonHsuFet/Working_Shift/raw/refs/heads/main/All_2025.xlsx,https://github.com/JasonHsuFet/Working_Shift/raw/refs/heads/main/All_2026.xlsx"
FILE_NAME="data/All_2025.xlsx,data/All_2026.xlsx"
OUTPUT_FILE_NAME="public/data/panda.json"
```

Optional override:

- `WORKER_NAME=all` to export every worker
- `WORKER_NAME=<name>` to export one worker only
