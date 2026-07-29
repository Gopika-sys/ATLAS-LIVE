import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import LabelEncoder
import joblib
import os

COLUMNS = [
    "duration","protocol_type","service","flag","src_bytes","dst_bytes","land",
    "wrong_fragment","urgent","hot","num_failed_logins","logged_in","num_compromised",
    "root_shell","su_attempted","num_root","num_file_creations","num_shells",
    "num_access_files","num_outbound_cmds","is_host_login","is_guest_login","count",
    "srv_count","serror_rate","srv_serror_rate","rerror_rate","srv_rerror_rate",
    "same_srv_rate","diff_srv_rate","srv_diff_host_rate","dst_host_count",
    "dst_host_srv_count","dst_host_same_srv_rate","dst_host_diff_srv_rate",
    "dst_host_same_src_port_rate","dst_host_srv_diff_host_rate","dst_host_serror_rate",
    "dst_host_srv_serror_rate","dst_host_rerror_rate","dst_host_srv_rerror_rate",
    "label","difficulty"
]

BASE_DIR = os.path.dirname(__file__)
df = pd.read_csv(os.path.join(BASE_DIR, "KDDTrain.txt"), names=COLUMNS)

# Encode categorical columns
categorical_cols = ["protocol_type", "service", "flag"]
encoders = {}
for col in categorical_cols:
    le = LabelEncoder()
    df[col] = le.fit_transform(df[col])
    encoders[col] = le

# Features only (drop label + difficulty)
X = df.drop(columns=["label", "difficulty"])

# Train Isolation Forest (unsupervised anomaly detection)
model = IsolationForest(
    n_estimators=150,
    contamination=0.15,   # rough expected anomaly ratio
    random_state=42
)
model.fit(X)

# Save model + encoders + column order
joblib.dump(model, os.path.join(BASE_DIR, "isolation_forest.joblib"))
joblib.dump(encoders, os.path.join(BASE_DIR, "encoders.joblib"))
joblib.dump(list(X.columns), os.path.join(BASE_DIR, "feature_columns.joblib"))

print("Model trained and saved.")
print("Feature count:", X.shape[1])
print("Sample anomaly scores:", model.decision_function(X.head()))