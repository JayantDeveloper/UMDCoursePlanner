# BetterPrep

Full-stack PlanetTerp review scraper with a React frontend and Flask backend.

## Project Structure

- `backend/`: Flask API that scrapes reviews
- `frontend/`: React UI (Vite)

## Backend Setup

```bash
cd BetterPrep/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export GOOGLE_API_KEY=YOUR_GEMINI_API_KEY
python app.py
```

The API runs on `http://localhost:5000`.

### API

`POST /api/scrape`

Body:

```json
{ "professor": "Regli, William", "course": "CMSC421" }
```

`POST /api/feedback`

Body:

```json
{ "professor": "Regli, William", "course": "CMSC421" }
```

## Frontend Setup

```bash
cd BetterPrep/frontend
npm install
npm run dev
```

Optional: set a custom backend URL.

```bash
VITE_BACKEND_URL=http://localhost:5000 npm run dev
```

## Notes

- Reviews are parsed from the server-rendered HTML in PlanetTerp professor pages.
- The backend includes a small delay to be polite with rate limits.
- If PlanetTerp changes its HTML structure, selectors in `backend/app.py` may need to be updated.
