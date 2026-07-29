"""
ATLAS Fast Smoke Test
Runs one representative test per section in parallel where possible.
Total expected runtime: 2-4 minutes.
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
from dotenv import load_dotenv
load_dotenv()

from concurrent.futures import ThreadPoolExecutor, as_completed
import time

results = []

def test(name, fn):
    start = time.time()
    try:
        out = fn()
        elapsed = time.time() - start
        print(f"  [PASS] {name} ({elapsed:.1f}s) => {str(out)[:80]}")
        results.append((name, True))
    except Exception as e:
        elapsed = time.time() - start
        print(f"  [FAIL] {name} ({elapsed:.1f}s) => {e}")
        results.append((name, False))

def section(title):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")

# ── 1. LLM ───────────────────────────────────────────────────
section("1. LLM CONNECTIVITY")
from app.llm.clients import fast_triage, deep_reasoning, voice_synthesis

# Run all 3 LLM calls in parallel
def _nano():
    r = fast_triage("brute force 30 failed logins from 1.2.3.4",
                    system='Respond ONLY valid JSON: {"severity":"high","agents":["firewall","login_monitor"]}')
    assert r and len(r) > 2; return r[:70].strip()

def _super():
    r = deep_reasoning("malware ransomware.lockbit detected on host",
                       system='Respond ONLY valid JSON: {"action":"escalate","severity":"critical","reasoning":"malware confirmed","approved_actions":[],"pending_approval":["quarantine_file"],"overall_threat":"critical","recommendations":["isolate host"]}')
    assert r and len(r) > 2; return r[:70].strip()

def _voice():
    r = voice_synthesis("Brute force attack blocked from 203.0.113.5. Severity high.")
    assert r and len(r) > 2; return r[:70].strip()

print("  Running 3 LLM calls in parallel...")
with ThreadPoolExecutor(max_workers=3) as ex:
    f1 = ex.submit(_nano)
    f2 = ex.submit(_super)
    f3 = ex.submit(_voice)
    test("Nemotron Nano 8B  (fast_triage)",    lambda: f1.result())
    test("Nemotron Super 49B (deep_reasoning)", lambda: f2.result())
    test("Voice Synthesis",                     lambda: f3.result())

# ── 2. ML SCORING ────────────────────────────────────────────
section("2. ML ANOMALY DETECTION")
from app.event_sim.log_generator import generate_event
from app.ml.score_event import score_event

def t_ml():
    passed = 0
    for etype in ["brute_force","malware","phishing","ddos","reverse_shell",
                  "sql_injection","insider_threat","data_exfiltration",
                  "privilege_escalation","port_scan","xss","weak_password"]:
        e = generate_event(); e["type"] = etype
        s = score_event(e)
        assert "severity" in s and "is_anomaly" in s
        passed += 1
    return f"all 12 attack types scored correctly"

test("score_event (all 12 types)", t_ml)

# ── 3. ALL 14 AGENTS IN PARALLEL ─────────────────────────────
section("3. ALL 14 AGENTS (parallel)")

BRUTE   = {"id":"t1","type":"brute_force","source_ip":"203.0.113.5","failed_logins":35,
           "target_port":22,"target_user":"root","severity":"high","is_anomaly":True}
MALWARE = {"id":"t2","type":"malware","source_ip":"198.51.100.9","malware_name":"ransomware.lockbit",
           "file_path":"C:\\invoice.exe","hash":"abc123","severity":"critical","is_anomaly":True}
PHISH   = {"id":"t3","type":"phishing","source_ip":"45.33.32.156","subject":"Urgent: Verify account",
           "sender":"noreply@paypa1.com","recipient":"admin@company.com","severity":"high","is_anomaly":True}
INSIDER = {"id":"t4","type":"insider_threat","source_ip":"192.168.1.50","user":"bwilson",
           "action":"bulk_download","data_volume_mb":4500,"severity":"high","is_anomaly":True}
EXFIL   = {"id":"t5","type":"data_exfiltration","destination_ip":"185.220.101.45",
           "data_volume_mb":1200,"protocol":"DNS","severity":"high","is_anomaly":True}
WEAK_PW = {"id":"t6","type":"weak_password","user":"admin","password_score":1,"severity":"medium","is_anomaly":True}

from app.agents.firewall_agent import FirewallAgent
from app.agents.login_monitor_agent import LoginMonitorAgent
from app.agents.threat_intel_agent import ThreatIntelAgent
from app.agents.network_monitor_agent import NetworkMonitorAgent
from app.agents.malware_detection_agent import MalwareDetectionAgent
from app.agents.phishing_detection_agent import PhishingDetectionAgent
from app.agents.forensics_agent import ForensicsAgent
from app.agents.log_analysis_agent import LogAnalysisAgent
from app.agents.incident_response_agent import IncidentResponseAgent
from app.agents.insider_threat_agent import InsiderThreatAgent
from app.agents.password_security_agent import PasswordSecurityAgent
from app.agents.report_generation_agent import ReportGenerationAgent
from app.agents.voice_assistant_agent import VoiceAssistantAgent
from app.agents.decision_making_agent import DecisionMakingAgent

AGENT_CASES = [
    ("FirewallAgent",          FirewallAgent(),          BRUTE),
    ("LoginMonitorAgent",      LoginMonitorAgent(),      BRUTE),
    ("ThreatIntelAgent",       ThreatIntelAgent(),       BRUTE),
    ("NetworkMonitorAgent",    NetworkMonitorAgent(),    EXFIL),
    ("MalwareDetectionAgent",  MalwareDetectionAgent(),  MALWARE),
    ("PhishingDetectionAgent", PhishingDetectionAgent(), PHISH),
    ("ForensicsAgent",         ForensicsAgent(),         MALWARE),
    ("LogAnalysisAgent",       LogAnalysisAgent(),       BRUTE),
    ("IncidentResponseAgent",  IncidentResponseAgent(),
     {"event":MALWARE,"agent_results":{"firewall":{"action":"block_ip","severity":"critical"}}}),
    ("InsiderThreatAgent",     InsiderThreatAgent(),     INSIDER),
    ("PasswordSecurityAgent",  PasswordSecurityAgent(),  WEAK_PW),
    ("ReportGenerationAgent",  ReportGenerationAgent(),
     {"type":"report_request","incidents":[{"title":"Brute force","severity":"high"}],"actions":[]}),
    ("VoiceAssistantAgent",    VoiceAssistantAgent(),
     {"event":BRUTE,"agent_results":{"firewall":{"action":"block_ip"}},"final_response":"IP blocked.","voice_query":"What happened?"}),
    ("DecisionMakingAgent",    DecisionMakingAgent(),
     {"event":MALWARE,"agent_results":{
         "malware_detection":{"action":"quarantine_file","severity":"critical"},
         "forensics":{"action":"timeline_created","severity":"critical"}}}),
]

def run_agent(name, agent, event):
    start = time.time()
    try:
        r = agent.run(event)
        assert isinstance(r, dict), f"not dict"
        assert r.get("action") != "error", f"agent error: {r.get('reasoning','')[:100]}"
        assert "action" in r and "severity" in r and "reasoning" in r
        assert r["severity"] in ("low","medium","high","critical")
        elapsed = time.time() - start
        return name, True, f"action={r['action']} sev={r['severity']} ({elapsed:.1f}s)"
    except Exception as e:
        elapsed = time.time() - start
        return name, False, f"{e} ({elapsed:.1f}s)"

print(f"  Running all 14 agents in parallel (max 14 workers)...")
with ThreadPoolExecutor(max_workers=14) as executor:
    futures = {executor.submit(run_agent, n, a, e): n for n, a, e in AGENT_CASES}
    agent_results_map = {}
    for future in as_completed(futures):
        name, ok, detail = future.result()
        agent_results_map[name] = (ok, detail)

# Print in original order
for name, _, _ in AGENT_CASES:
    ok, detail = agent_results_map[name]
    status = "[PASS]" if ok else "[FAIL]"
    print(f"  {status} {name} => {detail}")
    results.append((name, ok))

# ── 4. FULL PIPELINE ─────────────────────────────────────────
section("4. FULL LANGGRAPH PIPELINE")
from app.graph.master_graph import run_atlas

def t_pipeline():
    r = run_atlas(MALWARE)
    assert r.get("final_response"), "no final_response"
    assert r.get("agent_results"), "no agents ran"
    agents = list(r["agent_results"].keys())
    resp = r["final_response"][:60]
    return f"agents={agents} | {resp}..."

test("run_atlas (malware event)", t_pipeline)

# ── 5. MEMORY ────────────────────────────────────────────────
section("5. MEMORY SYSTEM")
from app.memory.atlas_memory import store_incident_memory, recall_similar, get_threat_pattern

def t_mem():
    store_incident_memory(BRUTE, {"firewall":{"action":"block_ip","severity":"high"}}, "IP blocked.", None)
    past = recall_similar(BRUTE, limit=3)
    pattern = get_threat_pattern("brute_force")
    return f"stored OK | recalled {len(past)} | pattern={pattern.get('times_seen','?')} seen"

test("memory store+recall+pattern", t_mem)

# ── 6. DATABASE ──────────────────────────────────────────────
section("6. DATABASE (Supabase)")
from app.db.writer import supabase

def t_db():
    tables = ["events","incidents","agent_actions","decision_log","voice_history","atlas_memory"]
    for tb in tables:
        r = supabase.table(tb).select("id").limit(1).execute()
    return f"all {len(tables)} tables accessible"

test("supabase all tables", t_db)

# ── SUMMARY ──────────────────────────────────────────────────
section("SUMMARY")
passed = sum(1 for _, ok in results if ok)
failed = sum(1 for _, ok in results if not ok)
print(f"\n  Total : {len(results)}")
print(f"  PASSED: {passed}")
print(f"  FAILED: {failed}")
if failed:
    print("\n  Failed:")
    for name, ok in results:
        if not ok:
            print(f"    [FAIL] {name}")
print(f"\n  {'ALL SYSTEMS GO' if failed == 0 else str(failed) + ' ISSUES NEED FIXING'}")
print("="*60)
