# JHU Expected Possession Value (EPV)

This is the frontend for the JHU EPV website. It is built with Next.js and connects to the `epv-web-server` backend for all live data, replay, tactical board calculations, and computer vision analysis.

## What this app does

The frontend includes:

* Interactive EPV Dashboard

  * Tactical board
  * Team and player selection
  * EPV decision panel
  * Player heatmaps
* Replay Tool

  * Match selection
  * Loss of possession moment selection
  * Replay preview when tracking exists in AWS
* Computer Vision Clip Analyzer

  * Upload an image
  * Run backend CV analysis
  * Display detections and recommendation output

## Project structure

This frontend is meant to run together with the backend repo:

* `epv-web-app` = Next.js frontend
* `epv-web-server` = FastAPI backend

The frontend does **not** connect directly to AWS RDS. It calls the backend API, and the backend handles:

* AWS RDS database access
* model inference
* replay data queries
* CV processing

## Prerequisites

Make sure you have these installed:

* Node.js 18+ recommended
* npm
* The backend repo set up separately

## Environment setup

Create a file named `.env.local` in the root of `epv-web-app`.

Add:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

This tells the frontend where your local FastAPI backend is running.

## How to run locally

You need **two terminals** running at the same time.

### Terminal 1: Run the backend

Go to the backend repo and start FastAPI:

```bash
cd ~/Desktop/JHU-Expected-Possession-Value/epv-web-server
source .venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

Leave this terminal running.

### Terminal 2: Run the frontend

Go to the frontend repo and start Next.js:

```bash
cd ~/Desktop/JHU-Expected-Possession-Value/epv-web-app
npm install
npm run dev
```

Leave this terminal running too.

## Local URLs

Once both are running:

* Frontend: `http://localhost:3000`
* Backend API docs: `http://127.0.0.1:8000/docs`

## Quick checks

After the backend starts, you can test that it is connected to the AWS-backed database:

```bash
curl http://127.0.0.1:8000/api/health/db
curl http://127.0.0.1:8000/api/tactics/teams
curl http://127.0.0.1:8000/replay/matches
```

Expected behavior:

* `/api/health/db` should return database connected status
* `/api/tactics/teams` should return MLS teams
* `/replay/matches` should return replayable match metadata from the backend

## Notes about data

The live site is designed so that:

* the backend reads SkillCorner / project data from AWS RDS at request time
* the frontend reads from backend API routes
* newly uploaded AWS database data should appear on the website on later requests if the relevant routes query that data

The frontend itself should not depend on local match/event files.

## Common issues

### Frontend loads but no data appears

Check that:

* backend is running on port `8000`
* `.env.local` contains the correct `NEXT_PUBLIC_API_BASE_URL`
* backend `/api/health/db` works

### Replay says no tracking data

That usually means the selected match has event data in AWS, but tracking rows are not loaded into the `frame` table for that match yet.

### CV tool errors

Make sure backend dependencies are installed from `epv-web-server/requirements.txt`, especially CV-related packages.

## Recommended workflow for contributors

1. Start backend in Terminal 1
2. Start frontend in Terminal 2
3. Open `http://localhost:3000`
4. Test Tactical Board, Replay Tool, and CV Tool
5. Watch the backend terminal for API or model errors

## Deployment note

For production:

* frontend can be deployed to Vercel
* backend should be deployed separately
* production environment variables must be configured in the deployment platform

The frontend production environment variable should point to the deployed backend URL, not localhost.
