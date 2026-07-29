"""
Show exact password policy and what ATLAS detected.
"""
import os, sys
sys.path.insert(0, ".")
from dotenv import load_dotenv
load_dotenv("../.env")
from supabase import create_client
import subprocess

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

# 1. Show raw net accounts output
print("=" * 60)
print("  WINDOWS PASSWORD POLICY (net accounts)")
print("=" * 60)
try:
    out = subprocess.check_output(["net", "accounts"], stderr=subprocess.DEVNULL, timeout=8).decode(errors="ignore")
    print(out)
except Exception as e:
    print("Error:", e)

# 2. Show the incident detail from DB
print("=" * 60)
print("  ATLAS INCIDENT DETAIL")
print("=" * 60)
inc_id = "ffd0518a-eba3-416e-a911-ff37c0087b51"
try:
    inc = sb.table("incidents").select("*").eq("id", inc_id).execute()
    if inc.data:
        i = inc.data[0]
        print(f"  Title    : {i['title']}")
        print(f"  Severity : {i['severity']}")
        print(f"  Status   : {i['status']}")
        print(f"  Source   : {i.get('data_source','NO TAG')}")
        print(f"  Created  : {i['created_at']}")
    else:
        print("  Incident not found.")
except Exception as e:
    print("  Error:", e)

# 3. Show agent actions for this incident
print()
print("=" * 60)
print("  AGENT ACTIONS FOR THIS INCIDENT")
print("=" * 60)
try:
    actions = sb.table("agent_actions").select("agent_name,action,params").eq("incident_id", inc_id).execute()
    for a in actions.data:
        params = a.get("params", {})
        print(f"\n  Agent    : {a['agent_name']}")
        print(f"  Action   : {a['action']}")
        if params.get("reasoning"):
            print(f"  Reasoning: {params['reasoning'][:300]}")
        if params.get("risk"):
            print(f"  Risk     : {params['risk']}")
        if params.get("affected_user"):
            print(f"  User     : {params['affected_user']}")
        if params.get("recommendation"):
            print(f"  Rec      : {params['recommendation']}")
        if params.get("description"):
            print(f"  Detail   : {params['description']}")
except Exception as e:
    print("  Error:", e)

# 4. Show decision log
print()
print("=" * 60)
print("  DECISION LOG")
print("=" * 60)
try:
    dec = sb.table("decision_log").select("reasoning_text,plan_json").eq("incident_id", inc_id).execute()
    for d in dec.data:
        print(f"  {d['reasoning_text'][:500]}")
except Exception as e:
    print("  Error:", e)
