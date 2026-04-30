from __future__ import annotations

import os

from flask import Flask, Response, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

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


@app.after_request
def ensure_cors(response: Response) -> Response:
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization")
    response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    return response


app.register_blueprint(comparison_bp)
app.register_blueprint(planner_bp)


@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "groq_key_set": bool(os.environ.get("GROQ_API_KEY")),
        "groq_key_prefix": (os.environ.get("GROQ_API_KEY") or "")[:8] or None,
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=True, threaded=True)
