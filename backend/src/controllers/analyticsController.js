const { query } = require('../db/pool');

exports.overview = async (req, res) => {
  const intv = { today:'1 day', week:'7 days', month:'30 days', quarter:'90 days' }[req.query.period||'today']||'1 day';
  const [cur, prev, channels, hourly] = await Promise.all([
    query(`SELECT COUNT(*) orders,COALESCE(SUM(total),0) gmv,COALESCE(AVG(total),0) aov,COUNT(*) FILTER(WHERE sla_breached) sla_breaches,ROUND(100.0*COUNT(*) FILTER(WHERE NOT sla_breached AND status NOT IN('pending','cancelled'))/NULLIF(COUNT(*) FILTER(WHERE status NOT IN('pending','cancelled')),0),1) sla_hit_rate,COUNT(*) FILTER(WHERE status='cancelled') cancellations,COUNT(*) FILTER(WHERE status='returned') returns FROM orders WHERE created_at>=NOW()-INTERVAL '${intv}'`),
    query(`SELECT COUNT(*) orders,COALESCE(SUM(total),0) gmv FROM orders WHERE created_at>=NOW()-INTERVAL '${intv}'*2 AND created_at<NOW()-INTERVAL '${intv}'`),
    query(`SELECT channel,COUNT(*) orders,COALESCE(SUM(total),0) gmv,ROUND(100.0*COUNT(*) FILTER(WHERE NOT sla_breached AND status NOT IN('pending','cancelled'))/NULLIF(COUNT(*) FILTER(WHERE status NOT IN('pending','cancelled')),0),1) sla_pct,ROUND(100.0*COUNT(*) FILTER(WHERE status='returned')/NULLIF(COUNT(*),0),1) return_rate FROM orders WHERE created_at>=NOW()-INTERVAL '${intv}' GROUP BY channel ORDER BY orders DESC`),
    query(`SELECT EXTRACT(HOUR FROM created_at) hour,COUNT(*) orders,COALESCE(SUM(total),0) gmv FROM orders WHERE created_at>=NOW()-INTERVAL '1 day' GROUP BY hour ORDER BY hour`)
  ]);
  const c = cur.rows[0]; const pv = prev.rows[0];
  res.json({
    period: req.query.period || 'today',
    kpis: { ...c,
      gmv_delta_pct:   pv.gmv   > 0 ? +((c.gmv   - pv.gmv)   / pv.gmv   * 100).toFixed(1) : null,
      order_delta_pct: pv.orders > 0 ? +((c.orders - pv.orders)/ pv.orders * 100).toFixed(1) : null
    },
    channelBreakdown: channels.rows,
    hourlyTrend: hourly.rows
  });
};

exports.topSkus = async (req, res) => {
  const intv = { today:'1 day', week:'7 days', month:'30 days' }[req.query.period||'today']||'1 day';
  const { rows } = await query(`SELECT s.sku_code,s.product_name,s.category,SUM(oi.quantity) units_sold,SUM(oi.quantity*oi.unit_price) revenue,COUNT(DISTINCT oi.order_id) order_count FROM order_items oi JOIN skus s ON s.id=oi.sku_id JOIN orders o ON o.id=oi.order_id WHERE o.created_at>=NOW()-INTERVAL '${intv}' AND o.status NOT IN('cancelled') GROUP BY s.sku_code,s.product_name,s.category ORDER BY units_sold DESC LIMIT $1`, [parseInt(req.query.limit||10)]);
  res.json({ data: rows });
};

exports.fulfilment = async (_req, res) => {
  const { rows } = await query(`SELECT channel,COUNT(*) total,COUNT(*) FILTER(WHERE status='shipped') shipped,COUNT(*) FILTER(WHERE status='delivered') delivered,COUNT(*) FILTER(WHERE sla_breached) breached,ROUND(AVG(EXTRACT(EPOCH FROM(updated_at-created_at))/3600),1) avg_hours FROM orders WHERE created_at>=NOW()-INTERVAL '7 days' GROUP BY channel ORDER BY total DESC`);
  res.json({ data: rows });
};
