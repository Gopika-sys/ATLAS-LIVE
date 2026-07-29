import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_KEY"]

supabase = create_client(url, key)
response = supabase.table("events").select("*").execute()
print("Connected. Row count:", len(response.data))