import postgres from 'postgres';

const sql = postgres(process.env.POINTS_DATABASE_URL!);

async function main() {
  const result = await sql`
    SELECT 
        DATE(tx_timestamp) as activity_date,
        COUNT(DISTINCT CASE WHEN category IN ('pado-lottery', 'pado-games', 'pado-number-match', 'pado-scratch-card', 'pado-prediction') THEN identity_id END) as unique_gamers,
        COUNT(DISTINCT CASE WHEN category = 'pado-dex' THEN identity_id END) as unique_traders
    FROM activity_points
    WHERE tx_timestamp >= '2026-04-01 00:00:00' AND tx_timestamp <= '2026-04-14 23:59:59'
    GROUP BY DATE(tx_timestamp)
    ORDER BY activity_date;
  `;

  console.log("Date,UniqueGamers,UniqueSpotTraders");
  result.forEach(row => {
    console.log(`${row.activity_date.toISOString().slice(0, 10)},${row.unique_gamers},${row.unique_traders}`);
  });
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
