import { useAtlas } from "../hooks/useAtlas";
import type { NetworkConnection, NetworkDevice, NetworkThreat, NetworkWifiNetwork } from "../hooks/useAtlas";

// ── Severity colours ──────────────────────────────────────────────────────────
const SEV: Record<string, string> = {
  clean:    "var(--success)",
  low:      "var(--success)",
  medium:   "var(--warning)",
  high:     "#e8722c",
  critical: "var(--danger)",
  error:    "var(--danger)",
};

const SEV_BG: Record<string, string> = {
  clean:    "var(--success-soft)",
  low:      "var(--success-soft)",
  medium:   "var(--warning-soft)",
  high:     "rgba(232,114,44,.13)",
  critical: "var(--danger-soft)",
};

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function Dot({ color }: { color: string }) {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: color, flexShrink: 0,
    }} />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, color: "var(--muted)", textTransform: "uppercase",
      letterSpacing: "0.08em", marginBottom: 5, fontFamily: "var(--f-mono)",
    }}>{children}</div>
  );
}

function Val({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{
      fontFamily: mono ? "var(--f-mono)" : "var(--f-body)",
      fontSize: 13, fontWeight: 700, color: "var(--ink)",
    }}>{children}</div>
  );
}

// ── Signal bar visual ─────────────────────────────────────────────────────────
function SignalBars({ pct }: { pct: number }) {
  const bars = [25, 50, 75, 100];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>
      {bars.map((threshold, i) => (
        <div key={i} style={{
          width: 5,
          height: 6 + i * 4,
          borderRadius: 2,
          background: pct >= threshold ? "var(--success)" : "var(--line)",
          transition: "background .3s",
        }} />
      ))}
    </div>
  );
}

// ── WiFi Panel ────────────────────────────────────────────────────────────────
function WifiPanel() {
  const { networkData } = useAtlas();
  const wifi = networkData?.wifi;

  if (!wifi) return null;

  if (!wifi.available) {
    return (
      <div className="neo" style={{ padding: 20 }}>
        <div className="panel-title" style={{ marginBottom: 10 }}>WiFi</div>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>No wireless interface detected on this machine.</div>
      </div>
    );
  }

  const sigColor = (wifi.signal_pct ?? 0) >= 70 ? "var(--success)"
    : (wifi.signal_pct ?? 0) >= 40 ? "var(--warning)" : "var(--faint)";

  const netshBlocked = (wifi as any).netsh_blocked;
  const netshReason  = (wifi as any).netsh_reason as string | undefined;

  return (
    <div className="neo" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: "var(--info-soft)", color: "var(--info)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}>📶</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 15 }}>
            {wifi.ssid || wifi.interface_name || "Wi-Fi"}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
            {wifi.state} · {wifi.interface_name} · {wifi.ip}
          </div>
        </div>
        {/* Signal — only show if netsh gave us real data */}
        {!netshBlocked && (wifi.signal_pct ?? 0) > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SignalBars pct={wifi.signal_pct ?? 0} />
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 13, fontWeight: 700, color: sigColor }}>
              {wifi.signal_pct}%
            </span>
          </div>
        )}
      </div>

      {/* Permission warning banner */}
      {netshBlocked && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 14,
          background: "var(--warning-soft)",
          borderLeft: "3px solid var(--warning)",
          fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5,
        }}>
          <span style={{ fontWeight: 700, color: "var(--warning)" }}>⚠ Limited data — </span>
          {netshReason}
        </div>
      )}

      {/* Info grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          ["Interface",   wifi.interface_name || "—",          false],
          ["IP Address",  wifi.ip || "—",                      true],
          ["Link Speed",  wifi.link_speed_mbps ? `${wifi.link_speed_mbps} Mbps` : "—", false],
          ["State",       wifi.state || "—",                   false],
          ["BSSID",       wifi.bssid || "—",                   true],
          ["Band",        wifi.band  || "—",                   false],
          ["Channel",     wifi.channel || "—",                 false],
          ["Auth",        wifi.authentication || "—",          false],
          ["Cipher",      wifi.cipher || "—",                  false],
          ["↓ Recv",      wifi.receive_mbps  ? `${wifi.receive_mbps} Mbps`  : "—", true],
          ["↑ Send",      wifi.transmit_mbps ? `${wifi.transmit_mbps} Mbps` : "—", true],
          ["Signal",      wifi.signal_pct ? `${wifi.signal_pct}%` : "—",    false],
        ].map(([lbl, val, mono]) => (
          <div key={String(lbl)} className="neo-flat" style={{ padding: "10px 12px" }}>
            <Label>{lbl}</Label>
            <Val mono={!!mono}>{val}</Val>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Nearby Networks Panel ─────────────────────────────────────────────────────
function NearbyNetworks() {
  const { networkData } = useAtlas();
  const nets: NetworkWifiNetwork[] = networkData?.wifi_networks ?? [];
  if (nets.length === 0) return null;

  return (
    <div className="neo" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="panel-title">Nearby WiFi Networks</div>
        <span style={{ fontSize: 11, fontFamily: "var(--f-mono)", color: "var(--muted)" }}>
          {nets.length} detected
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
        {nets.map((n, i) => {
          const sig = n.signal_pct ?? 0;
          const sigColor = sig >= 70 ? "var(--success)" : sig >= 40 ? "var(--warning)" : "var(--danger)";
          const connected = n.ssid === networkData?.wifi?.ssid;
          return (
            <div key={i} className="neo-flat" style={{
              padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
              borderLeft: connected ? "3px solid var(--success)" : "3px solid transparent",
            }}>
              <SignalBars pct={sig} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                  {n.ssid || "(hidden)"}
                  {connected && (
                    <span style={{
                      fontSize: 9, fontFamily: "var(--f-mono)", fontWeight: 700,
                      background: "var(--success-soft)", color: "var(--success)",
                      padding: "1px 6px", borderRadius: 10,
                    }}>CONNECTED</span>
                  )}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
                  {n.band || "—"} · Ch {n.channel || "—"} · {n.authentication || "—"}
                </div>
              </div>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700, color: sigColor }}>
                {sig}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Bandwidth Panel ───────────────────────────────────────────────────────────
function BandwidthPanel() {
  const { networkData } = useAtlas();
  const bw = networkData?.bandwidth;
  if (!bw) return null;

  const maxKb = Math.max(bw.kb_sent_per_sec, bw.kb_recv_per_sec, 1);

  return (
    <div className="neo" style={{ padding: 20 }}>
      <div className="panel-title" style={{ marginBottom: 16 }}>Live Bandwidth</div>

      {/* Upload / Download bars */}
      {[
        { label: "↑ Upload",   kb: bw.kb_sent_per_sec, color: "#e8722c" },
        { label: "↓ Download", kb: bw.kb_recv_per_sec, color: "var(--info)" },
      ].map(({ label, kb, color }) => (
        <div key={label} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>{label}</span>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700, color }}>
              {kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB/s` : `${kb.toFixed(0)} KB/s`}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 6, background: "var(--line)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 6, background: color,
              width: `${Math.min(100, (kb / maxKb) * 100)}%`,
              transition: "width .5s ease",
            }} />
          </div>
        </div>
      ))}

      {/* Totals */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
        {[
          ["Total Sent",   `${bw.mb_sent_total} MB`],
          ["Total Recv",   `${bw.mb_recv_total} MB`],
          ["Pkts Sent",    String(bw.packets_sent_total ?? 0)],
          ["Pkts Recv",    String(bw.packets_recv_total ?? 0)],
        ].map(([lbl, val]) => (
          <div key={lbl} className="neo-inset" style={{ padding: "8px 12px" }}>
            <Label>{lbl}</Label>
            <Val mono>{val}</Val>
          </div>
        ))}
      </div>

      {/* Per-interface */}
      {(bw.per_interface ?? []).length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Label>Per Interface</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {bw.per_interface.slice(0, 6).map(nic => (
              <div key={nic.interface} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "6px 10px", borderRadius: 8, background: "var(--bg-2)",
              }}>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
                  {nic.interface}
                </span>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>
                  ↑{nic.mb_sent}MB · ↓{nic.mb_recv}MB
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Connected Devices Panel ───────────────────────────────────────────────────
function DevicesPanel() {
  const { networkData } = useAtlas();
  const devices: NetworkDevice[] = networkData?.devices ?? [];

  return (
    <div className="neo" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="panel-title">Connected Devices</div>
        <span style={{ fontSize: 11, fontFamily: "var(--f-mono)", color: "var(--muted)" }}>
          {devices.length} on LAN
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
        {devices.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 12 }}>No devices found in ARP cache.</div>
        )}
        {devices.map((d, i) => (
          <div key={i} className="neo-flat" style={{
            padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: d.is_self ? "var(--info-soft)" : d.is_gateway ? "var(--warning-soft)" : "var(--bg-2)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
            }}>
              {d.is_self ? "💻" : d.is_gateway ? "🌐" : "📱"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                {d.hostname !== d.ip ? d.hostname : d.ip}
                {d.is_self && (
                  <span style={{
                    fontSize: 9, fontFamily: "var(--f-mono)", fontWeight: 700,
                    background: "var(--info-soft)", color: "var(--info)",
                    padding: "1px 6px", borderRadius: 10,
                  }}>THIS MACHINE</span>
                )}
                {d.is_gateway && (
                  <span style={{
                    fontSize: 9, fontFamily: "var(--f-mono)", fontWeight: 700,
                    background: "var(--warning-soft)", color: "var(--warning)",
                    padding: "1px 6px", borderRadius: 10,
                  }}>GATEWAY</span>
                )}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
                {d.ip} · {d.mac}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Threats Panel ─────────────────────────────────────────────────────────────
function ThreatsPanel() {
  const { networkData } = useAtlas();
  const threats: NetworkThreat[] = networkData?.threats ?? [];

  return (
    <div className="neo" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="panel-title">Detected Threats</div>
        {threats.length > 0 && (
          <span className="badge badge-critical">{threats.length} active</span>
        )}
      </div>
      {threats.length === 0 ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px", borderRadius: 10, background: "var(--success-soft)",
        }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <span style={{ fontSize: 12.5, color: "var(--success)", fontWeight: 600 }}>
            No threats detected — network looks clean
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {threats.map((t, i) => (
            <div key={i} style={{
              padding: "12px 14px", borderRadius: 10,
              background: SEV_BG[t.severity] ?? "var(--bg-2)",
              borderLeft: `3px solid ${SEV[t.severity] ?? "var(--muted)"}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontSize: 10, fontFamily: "var(--f-mono)", fontWeight: 700,
                  color: SEV[t.severity], textTransform: "uppercase",
                }}>{t.severity}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700 }}>
                  {t.type.replace(/_/g, " ").toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>{t.description}</div>
              <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
                <span>⚡ {t.indicator}</span>
                <span>🔧 {t.recommended_action.replace(/_/g, " ")}</span>
                {t.process && t.process !== "network_level" && <span>⚙ {t.process}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Connections Table ─────────────────────────────────────────────────────────
function ConnectionsTable() {
  const { networkData } = useAtlas();
  const conns: NetworkConnection[] = networkData?.connections ?? [];

  // Show only established + listening, sorted by packet_count desc
  const sorted = [...conns]
    .filter(c => c.destination_ip !== "—")
    .sort((a, b) => b.packet_count - a.packet_count)
    .slice(0, 50);

  const TH = ({ children }: { children: React.ReactNode }) => (
    <th style={{
      padding: "8px 12px", textAlign: "left", fontSize: 10,
      fontFamily: "var(--f-mono)", color: "var(--muted)",
      textTransform: "uppercase", letterSpacing: "0.08em",
      borderBottom: "1px solid var(--line)", fontWeight: 700,
    }}>{children}</th>
  );

  const TD = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
    <td style={{
      padding: "7px 12px", fontSize: 11.5,
      fontFamily: mono ? "var(--f-mono)" : "var(--f-body)",
      color: "var(--ink-2)", borderBottom: "1px solid var(--line)",
      whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis",
    }}>{children}</td>
  );

  return (
    <div className="neo" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="panel-title">Active Connections</div>
        <span style={{ fontSize: 11, fontFamily: "var(--f-mono)", color: "var(--muted)" }}>
          {conns.length} total · showing {sorted.length}
        </span>
      </div>
      <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
            <tr>
              <TH>Source IP</TH>
              <TH>Destination IP</TH>
              <TH>Proto</TH>
              <TH>Port</TH>
              <TH>Status</TH>
              <TH>Process</TH>
              <TH>Pkts</TH>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 12 }}>
                  No active connections with remote hosts.
                </td>
              </tr>
            )}
            {sorted.map((c, i) => {
              const isSuspicious = [4444, 1337, 9001, 31337, 6666, 5555].includes(c.destination_port);
              return (
                <tr key={i} style={{ background: isSuspicious ? "var(--danger-soft)" : "transparent" }}>
                  <TD mono>{c.source_ip}</TD>
                  <TD mono>{c.destination_ip}</TD>
                  <TD>
                    <span style={{
                      fontSize: 10, fontFamily: "var(--f-mono)", fontWeight: 700,
                      padding: "2px 6px", borderRadius: 6,
                      background: c.protocol === "TCP" ? "var(--info-soft)" : "var(--warning-soft)",
                      color: c.protocol === "TCP" ? "var(--info)" : "var(--warning)",
                    }}>{c.protocol}</span>
                  </TD>
                  <TD mono>
                    <span style={{ color: isSuspicious ? "var(--danger)" : "inherit", fontWeight: isSuspicious ? 700 : 400 }}>
                      {c.destination_port}
                    </span>
                  </TD>
                  <TD>
                    <span style={{
                      fontSize: 10, fontFamily: "var(--f-mono)",
                      color: c.status === "ESTABLISHED" ? "var(--success)" : "var(--muted)",
                    }}>{c.status}</span>
                  </TD>
                  <TD>{c.process}</TD>
                  <TD mono>{c.packet_count}</TD>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NetworkMonitor() {
  const { networkData, networkLoading, refreshNetwork } = useAtlas();

  const status = networkData?.network_status ?? "—";
  const statusColor = SEV[status] ?? "var(--muted)";
  const ts = networkData?.timestamp
    ? new Date(networkData.timestamp).toLocaleTimeString()
    : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Live Monitoring</div>
          <h1 style={{ fontFamily: "var(--f-display)", fontSize: 24, margin: "0 0 4px" }}>
            Network Monitor
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 13, maxWidth: 520 }}>
            Real-time WiFi, connections, devices, bandwidth and threat detection for this machine.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {/* Status pill */}
          <div className="neo-flat" style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 16px", borderRadius: 30,
          }}>
            <Dot color={statusColor} />
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 700, color: statusColor }}>
              {status.toUpperCase()}
            </span>
          </div>
          {/* Last updated */}
          <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
            {ts}
          </span>
          {/* Refresh */}
          <button
            className="btn btn-primary btn-sm"
            onClick={refreshNetwork}
            disabled={networkLoading}
          >
            {networkLoading ? "Refreshing…" : "⟳ Refresh"}
          </button>
        </div>
      </div>

      {/* Summary stat row */}
      {networkData && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {[
            {
              label: "Network Status",
              value: status.toUpperCase(),
              color: statusColor,
              bg: SEV_BG[status] ?? "var(--bg-2)",
            },
            {
              label: "Active Connections",
              value: networkData.summary.total_connections,
              color: "var(--info)",
              bg: "var(--info-soft)",
            },
            {
              label: "LAN Devices",
              value: networkData.summary.total_devices,
              color: "var(--accent)",
              bg: "rgba(52,87,216,.1)",
            },
            {
              label: "Threats Detected",
              value: networkData.summary.total_threats,
              color: networkData.summary.total_threats > 0 ? "var(--danger)" : "var(--success)",
              bg: networkData.summary.total_threats > 0 ? "var(--danger-soft)" : "var(--success-soft)",
            },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className="neo" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "var(--f-mono)" }}>
                {label}
              </div>
              <div style={{
                fontFamily: "var(--f-display)", fontSize: 28, fontWeight: 700,
                color, background: bg, borderRadius: 10,
                padding: "6px 12px", display: "inline-block",
              }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {networkLoading && !networkData && (
        <div className="neo" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ color: "var(--muted)", fontFamily: "var(--f-mono)", fontSize: 13 }}>
            Fetching live network data…
          </div>
        </div>
      )}

      {networkData && (
        <>
          {/* WiFi + Bandwidth */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18, alignItems: "start" }}>
            <WifiPanel />
            <BandwidthPanel />
          </div>

          {/* Nearby networks + Devices */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
            <NearbyNetworks />
            <DevicesPanel />
          </div>

          {/* Threats */}
          <ThreatsPanel />

          {/* Connections table */}
          <ConnectionsTable />
        </>
      )}
    </div>
  );
}
