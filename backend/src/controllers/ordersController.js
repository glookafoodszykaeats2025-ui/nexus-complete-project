const { v4: uuid } = require('uuid');
const { query, withTransaction } = require('../db/pool');

exports.list = async (req, res) => {
  const { status, channel, warehouse_id, search, sla_breached, page = 1, limit = 20, sort = 'created_at', order = 'desc' } = req.query;
  const allowed = ['created_at','total','order_number','status','channel'];
  const col = allowed.includes(sort) ? sort : 'created_at';
  const dir = order === 'asc' ? 'ASC' : 'DESC';
  const conds = []; const params = []; let p = 1;
  if (status)       { conds.push(`o.status=$${p++}`);       params.push(status); }
  if (channel)      { conds.push(`o.channel=$${p++}`);      params.push(channel); }
  if (warehouse_id) { conds.push(`o.warehouse_id=$${p++}`); params.push(warehouse_id); }
  if (sla_breached === 'true') conds.push('o.sla_breached=TRUE');
  if (search) { conds.push(`(o.order_number ILIKE $${p} OR o.customer_name ILIKE $${p} OR o.awb_number ILIKE $${p})`); params.push(`%${search}%`); p++; }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const offset = (parseInt(page)-1)*parseInt(limit);
  const [cnt, rows] = await Promise.all([
    query(`SELECT COUNT(*) FROM orders o ${where}`, params),
    query(`SELECT o.*,w.code warehouse_code,(SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) item_count FROM orders o LEFT JOIN warehouses w ON w.id=o.warehouse_id ${where} ORDER BY o.${col} ${dir} LIMIT $${p} OFFSET $${p+1}`, [...params, parseInt(limit), offset])
  ]);
  res.json({ data: rows.rows, pagination: { total: parseInt(cnt.rows[0].count), page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(parseInt(cnt.rows[0].count)/parseInt(limit)) } });
};

exports.stats = async (req, res) => {
  const intv = { today:'1 day', week:'7 days', month:'30 days', quarter:'90 days' }[req.query.period||'today']||'1 day';
  const [ov,ch,st] = await Promise.all([
    query(`SELECT COUNT(*) orders,COALESCE(SUM(total),0) gmv,COALESCE(AVG(total),0) aov,COUNT(*) FILTER(WHERE sla_breached) sla_breaches,ROUND(100.0*COUNT(*) FILTER(WHERE NOT sla_breached AND status NOT IN('pending','cancelled'))/NULLIF(COUNT(*) FILTER(WHERE status NOT IN('pending','cancelled')),0),1) sla_hit_rate FROM orders WHERE created_at>=NOW()-INTERVAL '${intv}'`),
    query(`SELECT channel,COUNT(*) orders,COALESCE(SUM(total),0) gmv,ROUND(100.0*COUNT(*) FILTER(WHERE NOT sla_breached AND status NOT IN('pending','cancelled'))/NULLIF(COUNT(*) FILTER(WHERE status NOT IN('pending','cancelled')),0),1) sla_pct FROM orders WHERE created_at>=NOW()-INTERVAL '${intv}' GROUP BY channel ORDER BY orders DESC`),
    query(`SELECT status,COUNT(*) count FROM orders WHERE created_at>=NOW()-INTERVAL '${intv}' GROUP BY status`)
  ]);
  res.json({ overview: ov.rows[0], byChannel: ch.rows, byStatus: st.rows });
};

exports.get = async (req, res) => {
  const { rows } = await query(`SELECT o.*,w.code wh_code,w.name wh_name FROM orders o LEFT JOIN warehouses w ON w.id=o.warehouse_id WHERE o.id=$1 OR o.order_number=$1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Order not found' });
  const o = rows[0];
  const [items, events] = await Promise.all([
    query(`SELECT oi.*,s.sku_code,s.product_name FROM order_items oi JOIN skus s ON s.id=oi.sku_id WHERE oi.order_id=$1`, [o.id]),
    query(`SELECT oe.*,u.name actor_name FROM order_events oe LEFT JOIN users u ON u.id=oe.actor_id WHERE oe.order_id=$1 ORDER BY oe.created_at ASC`, [o.id])
  ]);
  res.json({ ...o, items: items.rows, events: events.rows });
};

exports.create = async (req, res) => {
  const { channel, customer_name, customer_email, customer_phone, warehouse_id, items = [], notes, payment_status = 'paid', courier } = req.body;
  if (!items.length) return res.status(422).json({ error: 'At least one item required' });
  const result = await withTransaction(async (client) => {
    const { rows: last } = await client.query('SELECT order_number FROM orders ORDER BY created_at DESC LIMIT 1');
    const lastNum = last.length ? parseInt(last[0].order_number.replace('ORD-','')) : 8860;
    const orderNumber = `ORD-${lastNum+1}`;
    let subtotal = 0; const resolved = [];
    for (const item of items) {
      const { rows: sk } = await client.query('SELECT id,sku_code,product_name,mrp FROM skus WHERE id=$1 OR sku_code=$1', [item.sku_id]);
      if (!sk.length) throw Object.assign(new Error(`SKU not found: ${item.sku_id}`), { status: 422 });
      const price = item.unit_price ?? sk[0].mrp ?? 0;
      subtotal += price * (item.quantity||1);
      resolved.push({ sku_id: sk[0].id, quantity: item.quantity||1, unit_price: price });
    }
    const { rows } = await client.query(
      `INSERT INTO orders(id,order_number,channel,customer_name,customer_email,customer_phone,status,payment_status,subtotal,shipping_fee,total,warehouse_id,courier,sla_deadline,notes) VALUES($1,$2,$3,$4,$5,$6,'pending',$7,$8,49,$9,$10,$11,$12,$13) RETURNING *`,
      [uuid(),orderNumber,channel,customer_name,customer_email||null,customer_phone||null,payment_status,subtotal,subtotal+49,warehouse_id||null,courier||null,new Date(Date.now()+24*3600000),notes||null]
    );
    const order = rows[0];
    for (const item of resolved) await client.query('INSERT INTO order_items(id,order_id,sku_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5)', [uuid(),order.id,item.sku_id,item.quantity,item.unit_price]);
    await client.query('INSERT INTO order_events(id,order_id,event_type,description,actor_id) VALUES($1,$2,$3,$4,$5)', [uuid(),order.id,'order_received',`Received from ${channel}`,req.user.id]);
    return order;
  });
  res.status(201).json(result);
};

exports.updateStatus = async (req, res) => {
  const { id } = req.params; const { status, courier, awb_number, notes } = req.body;
  const sets = ['status=$2','updated_at=NOW()']; const params = [id, status]; let p = 3;
  if (courier)    { sets.push(`courier=$${p++}`);    params.push(courier); }
  if (awb_number) { sets.push(`awb_number=$${p++}`); params.push(awb_number); }
  const { rows } = await query(`UPDATE orders SET ${sets.join(',')} WHERE id=$1 RETURNING *`, params);
  if (!rows.length) return res.status(404).json({ error: 'Order not found' });
  await query('INSERT INTO order_events(id,order_id,event_type,description,actor_id) VALUES($1,$2,$3,$4,$5)', [uuid(),id,`status_${status}`,notes||`Status → ${status}`,req.user.id]);
  res.json(rows[0]);
};

exports.cancel = async (req, res) => {
  const { rows } = await query(`UPDATE orders SET status='cancelled',updated_at=NOW() WHERE id=$1 AND status NOT IN('shipped','delivered') RETURNING *`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Order not found or cannot be cancelled' });
  await query('INSERT INTO order_events(id,order_id,event_type,description,actor_id) VALUES($1,$2,$3,$4,$5)', [uuid(),req.params.id,'cancelled','Cancelled',req.user.id]);
  res.json(rows[0]);
};
