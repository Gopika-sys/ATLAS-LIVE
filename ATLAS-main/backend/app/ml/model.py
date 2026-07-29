import os
import joblib
import numpy as np
import pandas as pd

_DIR = os.path.dirname(__file__)

_model = None
_encoders = None
_columns = None

CATEGORICAL = ["protocol_type", "service", "flag"]


def _load():
    global _model, _encoders, _columns
    if _model is None:
        _model = joblib.load(os.path.join(_DIR, "isolation_forest.joblib"))
        _encoders = joblib.load(os.path.join(_DIR, "encoders.joblib"))
        _columns = joblib.load(os.path.join(_DIR, "feature_columns.joblib"))


def predict(features: dict) -> dict:
    """
    features: dict with NSL-KDD field names (minus label/difficulty).
    Returns: {"anomaly": bool, "score": float}
    """
    _load()
    row = []
    for col in _columns:
        val = features.get(col, 0)
        if col in CATEGORICAL:
            le = _encoders[col]
            val = le.transform([val])[0] if val in le.classes_ else 0
        row.append(val)

    X = pd.DataFrame([row], columns=_columns)
    score = float(_model.decision_function(X)[0])
    anomaly = bool(_model.predict(X)[0] == -1)
    return {"anomaly": anomaly, "score": round(score, 4)}