import {
  createContext, useContext, useEffect, useRef, useState,
  useCallback, type ReactNode,
} from "react";

const API = "http://localhost:8000";
const WS  = "ws://localhost:8000/ws";

export interface AtlasEvent {
  id?: string; ts?: string; type: string;
  severity: "low" | "medium" | "high" | "critical";
  source?: string; raw_payload?: Record<string, unknown>;
}
export interface Incident {
  id: string; title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: string; created_at: string;
}
export interface AgentAction {
  id?: string; agent_name: string; action: string;
  incident_id?: string; ts?: string; params?: Record<string, unknown>;
}
export interface Decision {
  id?: string; reasoning_text: string;
  plan_json?: Record<string, unknown>; ts?: string;
}
export interface Stats {
  total_incidents: number; open_incidents: number; total_events: number;
  event_type_counts: Record<string, number>; severity_counts: Record<string, number>;
  agents_active: number; memory_incidents: number; recurring_threats: Record<string, number>;
}
export interface DashboardState {
  threat_level: "low" | "medium" | "high" | "critical";
  security_score: number;
  events: AtlasEvent[]; incidents: Incident[]; agent_actions: AgentAction[];
  decision_log: Decision[]; blocked_ips: AgentAction[];
  voice_history: { transcribed?: string; response_text?: string; ts?: string }[];
  recommendations: string[]; pending_approvals: unknown[]; stats: Stats;
}

export interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
}

export interface AlertBanner {
  id: string;
  severity: "high" | "critical";
  title: string;
  incident_id?: string;
}

const EMPTY: DashboardState = {
  threat_level: "low", security_score: 100,
  events: [], incidents: [], agent_actions: [], decision_log: [],
  blocked_ips: [], voice_history: [], recommendations: [], pending_approvals: [],
  stats: {
    total_incidents: 0, open_incidents: 0, total_events: 0,
    event_type_counts: {}, severity_counts: {}, agents_active: 0,
    memory_incidents: 0, recurring_threats: {},
  },
};

export interface MachineProfile {
  hostname: string; primary_ip: string; os: string; architecture: string;
  cpu_cores: number; ram_gb: number; disk_gb: number;
  network_interfaces: Record<string, string>;
  open_ports: { port: number; process: string }[];
  local_users: string[];
  network_topology: { gateway?: string; dns?: string[]; subnet_mask?: string };
  firewall: { enabled: boolean; details: string };
  security_tools: string[];
  running_services: string[];
  profiled_at: string;
}

export interface NetworkConnection {
  source_ip: string; source_port: number;
  destination_ip: string; destination_port: number;
  protocol: string; status: string; process: string;
  pid: number | null; packet_count: number;
}
export interface NetworkDevice {
  ip: string; mac: string; hostname: string;
  is_gateway: boolean; is_self: boolean;
}
export interface NetworkWifi {
  available: boolean; ssid?: string; bssid?: string; state?: string;
  interface_name?: string; band?: string; channel?: string;
  authentication?: string; cipher?: string; ip?: string;
  link_speed_mbps?: number; netsh_available?: boolean;
  netsh_blocked?: boolean; netsh_reason?: string;
  signal_pct?: number; receive_mbps?: number; transmit_mbps?: number;
  signal_bar?: string;
}
export interface NetworkWifiNetwork {
  ssid: string; bssid?: string; signal_pct?: number;
  authentication?: string; encryption?: string; band?: string; channel?: string;
}
export interface NetworkBandwidth {
  bytes_sent_per_sec: number; bytes_recv_per_sec: number;
  kb_sent_per_sec: number; kb_recv_per_sec: number;
  mb_sent_total: number; mb_recv_total: number;
  per_interface: { interface: string; mb_sent: number; mb_recv: number }[];
}
export interface NetworkThreat {
  type: string; severity: string; indicator: string;
  description: string; recommended_action: string; process: string;
}
export interface NetworkData {
  timestamp: string; network_status: string;
  machine: { hostname: string; primary_ip: string; os: string; gateway: string; firewall: boolean };
  wifi: NetworkWifi;
  wifi_networks: NetworkWifiNetwork[];
  connections: NetworkConnection[];
  devices: NetworkDevice[];
  bandwidth: NetworkBandwidth;
  threats: NetworkThreat[];
  alerts: { id: number; severity: string; message: string; action: string }[];
  summary: { total_connections: number; total_devices: number; total_threats: number;
             threat_breakdown: Record<string, number> };
}

export interface LoginSession {
  user: string; terminal: string; host: string;
  started: string; known_user: boolean; after_hours: boolean; risk: string;
}
export interface LoginEvent {
  event_id: number; type: string; user?: string; source_ip?: string;
  time?: string; logon_type?: string; known_user: boolean; risk: string;
}
export interface LoginData {
  timestamp: string; overall_risk: string;
  machine: { hostname: string; primary_ip: string; known_users: string[] };
  active_sessions: LoginSession[];
  recent_logins: LoginEvent[];
  failed_summary: Record<string, number>;
  local_accounts: { username: string; source: string }[];
  password_policy: Record<string, string | number | boolean>;
  risk_summary: { critical: number; medium: number; low: number; failed_logins_total: number };
}

export interface MemoryStats {
  total_memories: number;
  by_type: Record<string, number>;
  recurring_threats: Record<string, number>;
  top_offender_ips: { ip: string; count: number }[];
}

interface AtlasCtx {
  state: DashboardState;
  liveEvents: AtlasEvent[];
  connected: boolean;
  toasts: Toast[];
  alerts: AlertBanner[];
  dismissAlert: (id: string) => void;
  machine: MachineProfile | null;
  memoryStats: MemoryStats | null;
  networkData: NetworkData | null;
  networkLoading: boolean;
  refreshNetwork: () => void;
  loginData: LoginData | null;
  loginLoading: boolean;
  refreshLogin: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  addToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
  sendVoice: (blob: Blob) => Promise<{ transcribed: string; response_text: string; intent?: string } | null>;
  sendTextCommand: (text: string) => Promise<{ transcribed: string; response_text: string; intent?: string } | null>;
  approveIncident: (id: string) => Promise<void>;
  resolveIncident: (id: string) => Promise<void>;
  refreshState: () => void;
}

const Ctx = createContext<AtlasCtx | null>(null);

export function AtlasProvider({ children }: { children: ReactNode }) {
  const [state, setState]           = useState<DashboardState>(EMPTY);
  const [liveEvents, setLiveEvents] = useState<AtlasEvent[]>([]);
  const [connected, setConnected]   = useState(false);
  const [toasts, setToasts]         = useState<Toast[]>([]);
  const [alerts, setAlerts]         = useState<AlertBanner[]>([]);
  const [machine, setMachine]           = useState<MachineProfile | null>(null);
  const [memoryStats, setMemoryStats]   = useState<MemoryStats | null>(null);
  const [networkData, setNetworkData]   = useState<NetworkData | null>(null);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [loginData, setLoginData]       = useState<LoginData | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [searchQuery, setSearchQuery]   = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const addToast = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...t, id }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(x => x.id !== id));
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API}/dashboard-state`);
      if (res.ok) setState(await res.json());
    } catch {}
  }, []);

  const refreshNetwork = useCallback(async () => {
    setNetworkLoading(true);
    try {
      const res = await fetch(`${API}/network/live`);
      if (res.ok) setNetworkData(await res.json());
    } catch {}
    setNetworkLoading(false);
  }, []);

  const refreshLogin = useCallback(async () => {
    setLoginLoading(true);
    try {
      const res = await fetch(`${API}/login/live`);
      if (res.ok) setLoginData(await res.json());
    } catch {}
    setLoginLoading(false);
  }, []);

  useEffect(() => {
    // Request browser notification permission once
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    fetch(`${API}/machine-profile`).then(r => r.ok ? r.json() : null).then(d => d && setMachine(d)).catch(() => {});
    fetch(`${API}/memory/stats`).then(r => r.ok ? r.json() : null).then(d => d && setMemoryStats(d)).catch(() => {});
    fetchState();
    refreshNetwork();
    refreshLogin();
    const netPoll = setInterval(refreshNetwork, 10000);
    const loginPoll = setInterval(refreshLogin, 15000);
    const poll = setInterval(() => {
      fetchState();
      fetch(`${API}/memory/stats`).then(r => r.ok ? r.json() : null).then(d => d && setMemoryStats(d)).catch(() => {});
    }, 60000);
    const connect = () => {
      const ws = new WebSocket(WS);
      wsRef.current = ws;
      ws.onopen    = () => setConnected(true);
      ws.onclose   = () => { setConnected(false); setTimeout(connect, 3000); };
      ws.onerror   = () => ws.close();
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.type === "event" && data.event) {
            setLiveEvents(prev => [data.event, ...prev].slice(0, 100));
            fetchState();
            // Alert banner + browser notification for high/critical
            const sev: string = data.severity ?? data.event?.severity ?? "";
            if (sev === "critical" || sev === "high") {
              const alertId = Math.random().toString(36).slice(2);
              const title = data.event?.type
                ? `${sev.toUpperCase()}: ${data.event.type.replace(/_/g, " ").toUpperCase()} detected`
                : `${sev.toUpperCase()} threat detected`;
              setAlerts(prev => [...prev.slice(-4), {
                id: alertId, severity: sev as "high" | "critical",
                title, incident_id: data.incident_id,
              }]);
              if (sev === "critical" && "Notification" in window && Notification.permission === "granted") {
                new Notification("ATLAS — Critical Threat", { body: title, icon: "/favicon.ico" });
              }
            }
          } else if (data.type === "state_update") {
            fetchState();
          }
        } catch {}
      };
    };
    connect();
    return () => { clearInterval(poll); clearInterval(netPoll); clearInterval(loginPoll); wsRef.current?.close(); };
  }, [fetchState, refreshNetwork, refreshLogin]);

  const sendVoice = async (blob: Blob) => {
    const form = new FormData();
    form.append("file", blob, "command.wav");
    try {
      const res = await fetch(`${API}/voice`, { method: "POST", body: form });
      if (res.ok) {
        const r = await res.json();
        fetchState();
        addToast({ type: "info", title: "Voice processed", message: r.transcribed });
        return r;
      }
    } catch { addToast({ type: "error", title: "Voice failed", message: "Could not reach backend" }); }
    return null;
  };

  const sendTextCommand = async (text: string) => {
    try {
      const res = await fetch(`${API}/voice/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const r = await res.json();
        fetchState();
        return r;
      }
    } catch { addToast({ type: "error", title: "Command failed", message: "Could not reach backend" }); }
    return null;
  };

  const approveIncident = async (id: string) => {
    try {
      const res = await fetch(`${API}/incidents/${id}/approve`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const succeeded: string[] = data.succeeded ?? [];
        const failed: string[]    = data.failed ?? [];
        const actionsRun: number  = data.actions_run ?? 0;

        if (actionsRun === 0) {
          addToast({ type: "info", title: "Incident approved", message: "No pending actions to execute." });
        } else {
          if (succeeded.length > 0)
            addToast({ type: "success", title: `Executed: ${succeeded.join(", ")}`, message: `${succeeded.length} action(s) ran successfully on the machine.` });
          if (failed.length > 0)
            addToast({ type: "error", title: `Failed: ${failed.join(", ")}`, message: "Run backend as Administrator for these actions." });
        }
        fetchState();
      } else {
        addToast({ type: "error", title: "Approve failed", message: `Status ${res.status}` });
      }
    } catch { addToast({ type: "error", title: "Network error" }); }
  };

  const resolveIncident = async (id: string) => {
    try {
      const res = await fetch(`${API}/incidents/${id}/resolve`, { method: "POST" });
      if (res.ok) {
        addToast({ type: "success", title: "Incident resolved", message: `#${id}` });
        fetchState();
      } else {
        addToast({ type: "error", title: "Resolve failed", message: `Status ${res.status}` });
      }
    } catch { addToast({ type: "error", title: "Network error" }); }
  };

  return (
    <Ctx.Provider value={{
      state, liveEvents, connected, toasts, alerts, dismissAlert,
      machine, memoryStats, networkData, networkLoading, refreshNetwork,
      loginData, loginLoading, refreshLogin,
      searchQuery, setSearchQuery,
      addToast, dismissToast, sendVoice, sendTextCommand,
      approveIncident, resolveIncident, refreshState: fetchState,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAtlas() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAtlas must be used inside AtlasProvider");
  return ctx;
}
