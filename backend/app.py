from __future__ import annotations

import os

import requests
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from config import OLLAMA_BASE_URL, OLLAMA_MODEL, GROQ_API_KEY, GROQ_MODEL
from routes.comparison import bp as comparison_bp
from routes.planner import bp as planner_bp

load_dotenv()

app = Flask(__name__)
CORS(
    app,
    origins="*",
    allow_headers=["Content-Type", "Accept", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
)

app.register_blueprint(comparison_bp)
app.register_blueprint(planner_bp)


@app.route("/api/health")
def health():
    if GROQ_API_KEY:
        return jsonify({
            "status": "ok",
            "ai_provider": "groq",
            "ai_model": GROQ_MODEL,
        })

    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        ollama_ok = r.status_code == 200
        models = [m["name"] for m in (r.json().get("models") or [])]
    except Exception:
        ollama_ok = False
        models = []
    return jsonify({
        "status": "ok",
        "ai_provider": "ollama",
        "ai_model": OLLAMA_MODEL,
        "ollama_reachable": ollama_ok,
        "models_available": models,
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=True, threaded=True)
