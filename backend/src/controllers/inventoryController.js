const { query, withTransaction } = require('../db/pool');

exports.list = async (req, res) => {
  const { warehouse_id, health, search, page = 1, limit = 20 } = req.query;
  const conds = []; const params = []; let p = 1;
  if (warehouse_id) { conds.push(`i.warehouse_id=$${p++}`); params.push(warehouse_id); }
  if (search) { conds.push(`(s.sku_code ILIKE $${p} OR s.product_name ILIKE $${p})`); params.push(`%${search}%`); p++; }
  if (health === 'out')     conds.push('i.quantity=0');
  if (health === 'low')     conds.push('i.quantity>0 AND i.quantity<=i.reorder_level');
  if (health === 'healthy') conds.push('i.quantity>i.reorder_level');
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const offset = (parseInt(page)-1)*parseInt(limit);
  const [cnt, rows] = await Promise.all([
    query(`SELECT COUNT(*) FROM inventory i JOIN skus s ON s.id=i.sku_id ${where}`, params),
    query(`SELECT i.id,i.quantity,i.reserved,i.reorder_level,i.updated_at,(i.quantity-i.reserved) available,CASE WHEN i.quantity=0 THEN 'out' WHEN i.quantity<=i.reorder_level THEN 'low' ELSE 'healthy' END health,s.id sku_id,s.sku_code,s.product_name,s.category,s.mrp,s.cost,w.id wh_id,w.code wh_code,w.name wh_name FROM inventory i JOIN skus s ON s.id=i.sku_id JOIN warehouses w ON w.id=i.warehouse_id ${where} ORDER BY health ASC,s.sku_code ASC LIMIT $${p} OFFSET $${p+1}`, [...params, parseInt(limit), offset])
  ]);
  res.json({ data: rows.rows, pagination: { total: parseInt(cnt.rows[0].count), page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(parseInt(cnt.rows[0].count)/parseInt(limit)) } });
};

exports.alerts = async (_req, res) => {
  const { rows } = await query(`SELECT s.sku_code,s.product_name,s.category,w.code wh_code,i.quantity,i.reserved,i.reorder_level,(i.quantity-i.reserved) available,CASE WHEN i.quantity=0 THEN 'out' ELSE 'low' END health FROM inventory i JOIN skus s ON s.id=i.sku_id JOIN warehouses w ON w.id=i.warehouse_id WHERE i.quantity<=i.reorder_level ORDER BY i.quantity ASC`);
  res.json({ data: rows, count: rows.length });
};

exports.summary = async (_req, res) => {
  const { rows } = await query(`SELECT COUNT(*) FILTER(WHERE i.quantity>i.reorder_level) healthy_count,COUNT(*) FILTER(WHERE i.quantity>0 AND i.quantity<=i.reorder_level) low_count,COUNT(*) FILTER(WHERE i.quantity=0) out_count,COALESCE(SUM(i.quantity*s.cost),0) total_value FROM inventory i JOIN skus s ON s.id=i.sku_id`);
  res.json(rows[0]);
};

exports.getBySku = async (req, res) => {
  const { rows } = await query(`SELECT i.*,s.sku_code,s.product_name,s.category,s.mrp,s.cost,w.code wh_code,w.name wh_name,(i.quantity-i.reserved) available,CASE WHEN i.quantity=0 THEN 'out' WHEN i.quantity<=i.reorder_level THEN 'low' ELSE 'healthy' END health FROM inventory i JOIN skus s ON s.id=i.sku_id JOIN warehouses w ON w.id=i.warehouse_id WHERE s.sku_code=$1`, [req.params.skuCode]);
  if (!rows.length) return res.status(404).json({ error: 'SKU not found' });
  res.json({ data: rows });
};

exports.adjust = async (req, res) => {
  const { sku_code, warehouse_id, adjustment_type, quantity } = req.body;
  if (!['add','remove','reserve','release'].includes(adjustment_type)) return res.status(422).json({ error: 'adjustment_type must be add|remove|reserve|release' });
  if (quantity <= 0) return res.status(422).json({ error: 'quantity must be positive' });
  const result = await withTransaction(async (client) => {
    const { rows: sk } = await client.query('SELECT id FROM skus WHERE sku_code=$1', [sku_code]);
    if (!sk.length) throw Object.assign(new Error('SKU not found'), { status: 404 });
    const { rows: inv } = await client.query('SELECT * FROM inventory WHERE sku_id=$1 AND warehouse_id=$2 FOR UPDATE', [sk[0].id, warehouse_id]);
    if (!inv.length) throw Object.assign(new Error('No inventory record found'), { status: 404 });
    const rec = inv[0];
    if (adjustment_type === 'remove'  && rec.quantity - rec.reserved < quantity) throw Object.assign(new Error('Insufficient available stock'), { status: 422 });
    if (adjustment_type === 'reserve' && rec.quantity - rec.reserved < quantity) throw Object.assign(new Error('Not enough available to reserve'), { status: 422 });
    if (adjustment_type === 'release' && rec.reserved < quantity) throw Object.assign(new Error('Cannot release more than reserved'), { status: 422 });
    const cols = { add:'quantity=quantity+$1', remove:'quantity=quantity-$1', reserve:'reserved=reserved+$1', release:'reserved=reserved-$1' };
    const { rows: updated } = await client.query(`UPDATE inventory SET ${cols[adjustment_type]},updated_at=NOW() WHERE sku_id=$2 AND warehouse_id=$3 RETURNING *`, [quantity, sk[0].id, warehouse_id]);
    return updated[0];
  });
  res.json({ data: result, message: `Inventory ${adjustment_type} successful` });
};
