from __future__ import annotations

import requests
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from config import GROQ_API_KEY, GROQ_MODEL
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
    return jsonify({
        "status": "ok",
        "ai_provider": "groq",
        "ai_model": GROQ_MODEL,
        "groq_key_set": bool(GROQ_API_KEY),
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=True, threaded=True)
