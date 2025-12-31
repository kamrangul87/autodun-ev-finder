import Link from "next/link";
// pages/ev-charging-council-dashboard.tsx
import React from "react";

const pageStyle: React.CSSProperties = {
  fontFamily:
    "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  minHeight: "100vh",
  background: "#f9fafb",
  color: "#111827",
};

const container: React.CSSProperties = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "32px 16px 40px",
};

const hero: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  marginBottom: 32,
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  padding: "4px 9px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  color: "#4b5563",
};

const h1Style: React.CSSProperties = {
  fontSize: 30,
  lineHeight: 1.15,
  fontWeight: 800,
  letterSpacing: "-0.03em",
};

const heroText: React.CSSProperties = {
  fontSize: 15,
  color: "#4b5563",
  maxWidth: 640,
};

const heroActions: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 8,
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 999,
  border: "1px solid #16a34a",
  background: "#16a34a",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  textDecoration: "none",
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  color: "#111827",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  textDecoration: "none",
};

const tagRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 4,
};

const tag: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  color: "#4b5563",
};

const section: React.CSSProperties = {
  marginTop: 32,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  marginBottom: 8,
};

const sectionSub: React.CSSProperties = {
  fontSize: 14,
  color: "#4b5563",
  marginBottom: 16,
};

const threeColGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 14,
};

const card: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  padding: 14,
};

const cardTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 4,
};

const cardBody: React.CSSProperties = {
  fontSize: 13,
  color: "#4b5563",
};

const stepsList: React.CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 8,
};

const stepRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
};

const stepNumber: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 999,
  background: "#e5f6ff",
  color: "#0369a1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: 13,
  flexShrink: 0,
};

const stepContent: React.CSSProperties = {
  fontSize: 13,
  color: "#374151",
};

const smallLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#9ca3af",
  marginBottom: 4,
};

const faqGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
};

const footer: React.CSSProperties = {
  marginTop: 40,
  paddingTop: 16,
  borderTop: "1px solid #e5e7eb",
  fontSize: 12,
  color: "#6b7280",
};

export default function EvChargingCouncilDashboardPage() {
  return (
    <div style={pageStyle}>
      <main style={container}>
        {/* Hero */}
        <section style={hero}>
          <div style={pill}>
            <span>⚡ EV data for councils</span>
            <span style={{ fontSize: 10, opacity: 0.8 }}>Autodun EV Finder</span>
          </div>

          <h1 style={h1Style}>
            EV charging council dashboard for UK local authorities
          </h1>

          <p style={heroText}>
            Autodun EV Finder turns fragmented{" "}
            <strong>EV charging point data, council boundaries</strong> and{" "}
            <strong>real driver feedback</strong> into a simple dashboard. Local
            authorities can spot EV charging gaps, justify funding bids and track
            network performance over time.
          </p>

          <div style={heroActions}>
            {/* TODO: replace email with your real contact */}
            <a
              href="mailto:hello@autodun.com?subject=Autodun%20EV%20Finder%20-%20Council%20demo"
              style={primaryBtn}
            >
              Request council demo
            </a>
            <a href="/" style={secondaryBtn}>
              View map demo
            </a>
            <a href="/ml-status" style={secondaryBtn}>
              View ML model status
            </a>
          </div>

          <div style={tagRow}>
            <span style={tag}>EV charging council dashboard</span>
            <span style={tag}>EV infrastructure planning</span>
            <span style={tag}>UK local authority boundaries</span>
            <span style={tag}>Real-time feedback &amp; scoring</span>
          </div>
        </section>

        {/* What it does */}
        <section style={section}>
          <h2 style={sectionTitle}>What Autodun EV Finder gives your council</h2>
          <p style={sectionSub}>
            A lightweight EV charging analytics dashboard built specifically for{" "}
            <strong>UK councils and transport teams</strong>.
          </p>

          <div style={threeColGrid}>
            <div style={card}>
              <div style={cardTitle}>EV charging heatmap by council</div>
              <p style={cardBody}>
                Visualise all public charge points over your local authority
                boundary. Quickly see high-density areas, gaps and potential
                locations for new sites.
              </p>
            </div>

            <div style={card}>
              <div style={cardTitle}>Real driver feedback &amp; ML scoring</div>
              <p style={cardBody}>
                Drivers submit simple “good / bad” feedback. Our nightly{" "}
                <strong>machine learning model</strong> scores station reliability,
                helping you prioritise under-performing sites.
              </p>
            </div>

            <div style={card}>
              <div style={cardTitle}>Evidence for funding bids</div>
              <p style={cardBody}>
                Export council-level data to support{" "}
                <strong>LEVI / local EV infrastructure</strong> funding bids,
                consultations and internal business cases.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section style={section}>
          <h2 style={sectionTitle}>How the council dashboard works</h2>
          <p style={sectionSub}>
            Autodun EV Finder combines public open data with your council
            boundary and ongoing feedback from drivers.
          </p>

          <div style={stepsList}>
            <div style={stepRow}>
              <div style={stepNumber}>1</div>
              <div style={stepContent}>
                <strong>Data ingest:</strong> We combine open EV charge point
                data with your council boundary polygons and internal station IDs
                (if available).
              </div>
            </div>
            <div style={stepRow}>
              <div style={stepNumber}>2</div>
              <div style={stepContent}>
                <strong>Feedback &amp; ML scoring:</strong> Drivers send quick
                feedback via the Autodun map. A nightly{" "}
                <strong>machine learning pipeline</strong> calculates accuracy,
                precision and recall for reliability scoring.
              </div>
            </div>
            <div style={stepRow}>
              <div style={stepNumber}>3</div>
              <div style={stepContent}>
                <strong>Council dashboard:</strong> Your team log in to view
                feedback clusters, worst performing stations and model metrics,
                and can export CSVs for further analysis.
              </div>
            </div>
          </div>
        </section>

        {/* Why councils use it */}
        <section style={section}>
          <h2 style={sectionTitle}>Why UK councils use an EV charging dashboard</h2>
          <p style={sectionSub}>
            EV charging is now a core part of local transport and climate
            planning. A dedicated dashboard helps your team move faster than
            static spreadsheets and ad-hoc maps.
          </p>

          <div style={threeColGrid}>
            <div style={card}>
              <div style={cardTitle}>Identify EV charging gaps</div>
              <p style={cardBody}>
                Compare high-demand areas against current coverage. Spot wards
                and neighbourhoods with very few reliable charge points.
              </p>
            </div>
            <div style={card}>
              <div style={cardTitle}>Prioritise interventions</div>
              <p style={cardBody}>
                Use model scores and feedback to prioritise where to add new
                charge points, upgrade hardware or work with charge point
                operators.
              </p>
            </div>
            <div style={card}>
              <div style={cardTitle}>Track performance over time</div>
              <p style={cardBody}>
                Monitor reliability trends, feedback volume and ML score changes
                as new stations go live or maintenance work is completed.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ / practical info */}
        <section style={section}>
          <h2 style={sectionTitle}>Practical details for councils</h2>
          <p style={sectionSub}>
            Designed to be simple for digital, transport and sustainability teams
            to adopt.
          </p>

          <div style={faqGrid}>
            <div style={card}>
              <div style={smallLabel}>Integration</div>
              <div style={cardTitle}>What data do we need to start?</div>
              <p style={cardBody}>
                We can start with public EV charge point data and your council
                boundary. If you have an internal asset list, we can map IDs so
                you can cross-reference with existing systems.
              </p>
            </div>

            <div style={card}>
              <div style={smallLabel}>Coverage</div>
              <div style={cardTitle}>Which councils can use this?</div>
              <p style={cardBody}>
                Autodun EV Finder is built for{" "}
                <strong>UK local authorities</strong> – including unitary
                authorities, county councils and combined authorities that want a
                clearer picture of public EV charging.
              </p>
            </div>

            <div style={card}>
              <div style={smallLabel}>Access</div>
              <div style={cardTitle}>How do we get a demo?</div>
              <p style={cardBody}>
                Use the{" "}
                <strong>&ldquo;Request council demo&rdquo; button</strong> above to
                contact us. We can walk through a live map and dashboard using
                your area as an example.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={footer}>
          <div>© {new Date().getFullYear()} Autodun EV Finder.</div>
          <div>Built for EV charging councils, local authorities and partners.</div>
        </footer>
      </main>
    </div>
  );
}
