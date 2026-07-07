from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import io

app = Flask(__name__)
CORS(app)

@app.route("/run-audit", methods=["POST"])
def run_audit():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    target_col = request.form.get("target_col", "")
    threshold = float(request.form.get("threshold", 0.75))

    try:
        df = pd.read_csv(io.StringIO(file.read().decode("utf-8")))
    except Exception as e:
        return jsonify({"error": f"Could not parse CSV: {str(e)}"}), 400

    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()

    if len(numeric_cols) < 2:
        return jsonify({"error": "At least two numeric columns are required for correlation analysis."}), 400

    if target_col not in numeric_cols:
        target_col = numeric_cols[-1]

    corr_matrix = df[numeric_cols].corr()
    target_correlations = corr_matrix[target_col].drop(target_col).abs()

    results = []
    for feature, value in target_correlations.items():
        results.append({
            "name": feature,
            "correlation": round(float(value), 4),
            "risk": "high" if value >= threshold else "low",
        })

    results.sort(key=lambda x: x["correlation"], reverse=True)

    preview_rows = df.head(10).fillna("").to_dict("records")

    return jsonify({
        "results": results,
        "columns": df.columns.tolist(),
        "numericColumns": numeric_cols,
        "rows": preview_rows,
        "totalRows": len(df),
        "totalCols": len(df.columns),
        "targetCol": target_col,
    })


@app.route("/columns", methods=["POST"])
def get_columns():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files["file"]
    try:
        df = pd.read_csv(io.StringIO(file.read().decode("utf-8")))
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    return jsonify({"columns": df.columns.tolist(), "numericColumns": numeric_cols})


if __name__ == "__main__":
    app.run(port=8080, host="0.0.0.0", debug=False)
