"""
ATLAS Pipeline — Real Network Mode only.
No simulation fallback. Every incident is from real system activity.
"""
from app.network.capture import start_collectors, get_real_event
from app.ml.score_event import score_event
from app.graph.master_graph import run_atlas


def run_pipeline():
    start_collectors()
    while True:
        import time
        try:
            event = get_real_event(timeout=10.0)
            if event is None:
                continue
            scored = score_event(event)
            if scored.get("is_anomaly"):
                print(f"[ATLAS] REAL: {scored['type']} | {scored['severity']} | {scored.get('source_ip','?')}")
                run_atlas(scored)
            else:
                print(f"[ATLAS] normal: {scored['type']}")
        except Exception as e:
            print(f"[ATLAS] pipeline error: {e}")
            time.sleep(1)


if __name__ == "__main__":
    run_pipeline()
