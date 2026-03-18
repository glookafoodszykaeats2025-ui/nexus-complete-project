const { query } = require('../db/pool');

exports.list = async (_req, res) => {
  const { rows } = await query(`SELECT w.*,COUNT(DISTINCT z.id) zone_count,COUNT(DISTINCT op.id) operator_count,COALESCE(SUM(i.quantity),0) total_units FROM warehouses w LEFT JOIN warehouse_zones z ON z.warehouse_id=w.id LEFT JOIN operators op ON op.warehouse_id=w.id LEFT JOIN inventory i ON i.warehouse_id=w.id WHERE w.is_active=TRUE GROUP BY w.id ORDER BY w.code`);
  res.json({ data: rows });
};

exports.get = async (req, res) => {
  const { rows: wh } = await query('SELECT * FROM warehouses WHERE id=$1 OR code=$1', [req.params.id]);
  if (!wh.length) return res.status(404).json({ error: 'Warehouse not found' });
  const w = wh[0];
  const [zones, ops, manifests, pending] = await Promise.all([
    query('SELECT * FROM warehouse_zones WHERE warehouse_id=$1 ORDER BY code', [w.id]),
    query(`SELECT op.*,z.code zone_code FROM operators op LEFT JOIN warehouse_zones z ON z.id=op.zone_id WHERE op.warehouse_id=$1 ORDER BY op.name`, [w.id]),
    query(`SELECT * FROM courier_manifests WHERE warehouse_id=$1 AND manifest_date=CURRENT_DATE ORDER BY courier_name`, [w.id]),
    query(`SELECT COUNT(*) cnt FROM orders WHERE warehouse_id=$1 AND status IN('pending','processing','packed')`, [w.id]),
  ]);
  res.json({ ...w, zones: zones.rows, operators: ops.rows, manifests: manifests.rows, pendingOrders: parseInt(pending.rows[0].cnt) });
};

exports.stats = async (req, res) => {
  const { rows: wh } = await query('SELECT id FROM warehouses WHERE id=$1 OR code=$1', [req.params.id]);
  if (!wh.length) return res.status(404).json({ error: 'Warehouse not found' });
  const whId = wh[0].id;
  const [opsSt, orderCnts, picks] = await Promise.all([
    query('SELECT status,COUNT(*) FROM operators WHERE warehouse_id=$1 GROUP BY status', [whId]),
    query(`SELECT COUNT(*) FILTER(WHERE status='pending') pending,COUNT(*) FILTER(WHERE status='processing') processing,COUNT(*) FILTER(WHERE status='packed') packed,COUNT(*) FILTER(WHERE status='shipped' AND created_at>=NOW()-INTERVAL '1 day') dispatched_today FROM orders WHERE warehouse_id=$1`, [whId]),
    query('SELECT COALESCE(SUM(picks_today),0) total FROM operators WHERE warehouse_id=$1', [whId]),
  ]);
  res.json({ operatorsByStatus: opsSt.rows, orderCounts: orderCnts.rows[0], totalPicks: parseInt(picks.rows[0].total) });
};

exports.updateOperator = async (req, res) => {
  const { status, zone_id, picks_today } = req.body;
  const sets = ['updated_at=NOW()']; const params = [req.params.id]; let p = 2;
  if (status !== undefined)      { sets.push(`status=$${p++}`);      params.push(status); }
  if (zone_id !== undefined)     { sets.push(`zone_id=$${p++}`);     params.push(zone_id); }
  if (picks_today !== undefined) { sets.push(`picks_today=$${p++}`); params.push(picks_today); }
  const { rows } = await query(`UPDATE operators SET ${sets.join(',')} WHERE id=$1 RETURNING *`, params);
  if (!rows.length) return res.status(404).json({ error: 'Operator not found' });
  res.json(rows[0]);
};

exports.updateManifest = async (req, res) => {
  const { status, bag_count } = req.body;
  const sets = ['updated_at=NOW()']; const params = [req.params.id]; let p = 2;
  if (status    !== undefined) { sets.push(`status=$${p++}`);    params.push(status); }
  if (bag_count !== undefined) { sets.push(`bag_count=$${p++}`); params.push(bag_count); }
  const { rows } = await query(`UPDATE courier_manifests SET ${sets.join(',')} WHERE id=$1 RETURNING *`, params);
  if (!rows.length) return res.status(404).json({ error: 'Manifest not found' });
  res.json(rows[0]);
};
