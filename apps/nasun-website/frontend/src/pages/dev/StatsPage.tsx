import React from "react";

const StatsPage: React.FC = () => {
  return (
    <div className="stats-page-container">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .stats-page-container {
          margin: 0;
          font-family: Arial, sans-serif;
          background: #0b0b0f;
          color: #fff;
          min-height: 100vh;
        }
        .container {
          max-width: 1200px;
          margin: auto;
          padding: 40px 20px;
        }
        h1, h2 {
          margin-bottom: 10px;
        }
        .hero {
          text-align: center;
          margin-bottom: 60px;
        }
        .hero h1 {
          font-size: 48px;
        }
        .hero p {
          color: #aaa;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
          margin-bottom: 60px;
        }
        .card {
          background: #15151c;
          padding: 20px;
          border-radius: 12px;
        }
        .card h3 {
          margin: 0;
          color: #888;
          font-size: 14px;
        }
        .card .value {
          font-size: 28px;
          margin-top: 10px;
          font-weight: bold;
        }
        .section {
          margin-bottom: 60px;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
        }
        .table th, .table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #333;
        }
        .highlight {
          color: #4cffb0;
        }
        .timeline {
          border-left: 2px solid #444;
          padding-left: 20px;
        }
        .timeline div {
          margin-bottom: 15px;
        }
      `,
        }}
      />

      <div className="container">
        {/* HERO */}
        <div className="hero">
          <h1>Nasun — First 30 Days</h1>
          <p>
            From zero to a live ecosystem with real users, real activity, and
            real engagement
          </p>
        </div>

        {/* KEY METRICS */}
        <div className="grid">
          <div className="card">
            <h3>Total On-chain Addresses</h3>
            <div className="value">48K</div>
          </div>
          <div className="card">
            <h3>Daily Active Addresses (DAU)</h3>
            <div className="value">37K (99% repeat users)</div>
          </div>

          <div className="card">
            <h3>Total Page Views</h3>
            <div className="value">1.87M</div>
          </div>
        </div>

        {/* ECOSYSTEM REACH */}
        <div className="section">
          <h2>Ecosystem Reach</h2>
          <div className="grid">
            <div className="card">
              <h3>Nasun Visitors for a month</h3>
              <div className="value">76.7K</div>

              <h3>Visits</h3>
              <div className="value">254K</div>

              <h3>Views</h3>
              <div className="value">1.3M</div>

              <h3>Bounce Rate</h3>
              <div className="value">27%</div>
              <h3>Visit Duration</h3>
              <div className="value">9m 2s</div>
            </div>
            <div className="card">
              <h3>Pado Visitors for two weeks</h3>
              <div className="value">21.8K</div>

              <h3>Visits</h3>
              <div className="value">106K</div>

              <h3>Views</h3>
              <div className="value">572K</div>

              <h3>Bounce Rate</h3>
              <div className="value">6%</div>
              <h3>Visit Duration</h3>
              <div className="value">9m 47s</div>
            </div>
          </div>
        </div>

        {/* ENGAGEMENT */}
        <div className="section">
          <h2>Engagement Quality</h2>
          <div className="grid">
            <div className="card">
              <h3>Avg Session (Nasun)</h3>
              <div className="value">9m 1s</div>
            </div>
            <div className="card">
              <h3>Avg Session (Pado)</h3>
              <div className="value">9m 47s</div>
            </div>
            <div className="card">
              <h3>Bounce Rate (Nasun)</h3>
              <div className="value">27%</div>
            </div>
            <div className="card">
              <h3>Bounce Rate (Pado)</h3>
              <div className="value highlight">6%</div>
            </div>
          </div>
        </div>

        {/* ON-CHAIN */}
        <div className="section">
          <h2>On-chain Activity</h2>
          <div className="grid">
            <div className="card">
              <h3>Daily Active Addresses</h3>
              <div className="value">37K</div>
            </div>
            <div className="card">
              <h3>Total Addresses</h3>
              <div className="value">48K</div>
            </div>
            <div className="card">
              <h3>Daily Transactions</h3>
              <div className="value">1M+</div>
            </div>
          </div>
        </div>

        {/* ECOSYSTEM BREAKDOWN */}
        <div className="section">
          <h2>Ecosystem Breakdown</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Nasun</th>
                <th>Pado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Visitors</td>
                <td>76.7K</td>
                <td>21.8K</td>
              </tr>
              <tr>
                <td>Visits</td>
                <td>254K</td>
                <td>106K</td>
              </tr>
              <tr>
                <td>Views</td>
                <td>1.3M</td>
                <td>572K</td>
              </tr>
              <tr>
                <td>Avg Session</td>
                <td>9m 1s</td>
                <td>9m 47s</td>
              </tr>
              <tr>
                <td>Bounce Rate</td>
                <td>27%</td>
                <td className="highlight">6%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* INSIGHTS */}
        <div className="section">
          <h2>Key Insights</h2>
          <div className="grid">
            <div className="card">
              <div className="value">🚀 Rapid Growth</div>
              <p>Strong user acquisition within the first 30 days</p>
            </div>
            <div className="card">
              <div className="value">🔁 Retention</div>
              <p>Majority of activity driven by returning users</p>
            </div>
            <div className="card">
              <div className="value">⚡ Engagement</div>
              <p>9+ minute average session across ecosystem</p>
            </div>
            <div className="card">
              <div className="value">🧠 Real Usage</div>
              <p>1M+ daily transactions on devnet</p>
            </div>
          </div>
        </div>

        {/* TIMELINE */}
        <div className="section">
          <h2>Timeline</h2>
          <div className="timeline">
            <div>
              <strong>Mar 4</strong> — Nasun Launch
            </div>
            <div>
              <strong>Apr 1</strong> — Pado Launch
            </div>
            <div>
              <strong>Apr 7</strong> — Activity Spike
            </div>
            <div>
              <strong>Apr 8</strong> — Peak Growth Phase
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsPage;
