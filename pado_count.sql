-- 4월 1일 ~ 14일 일자별 집계 쿼리
SELECT 
  DATE(tx_timestamp) as activity_date,
  COUNT(DISTINCT CASE WHEN category IN ('pado-lottery', 'pado-games') THEN identity_id END) as unique_gamers,
  COUNT(DISTINCT CASE WHEN category = 'pado-dex' THEN identity_id END) as unique_traders
FROM activity_points
WHERE tx_timestamp >= '2026-04-01 00:00:00' AND tx_timestamp <= '2026-04-14 23:59:59'
GROUP BY DATE(tx_timestamp)
ORDER BY activity_date;
