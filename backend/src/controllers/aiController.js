const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../db/pool');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const buildContext = async () => {
  const [kpis, channels, inv, wh] = await Promise.all([
    query(`SELECT COUNT(*) orders,COALESCE(SUM(total),0) gmv,ROUND(100.0*COUNT(*) FILTER(WHERE NOT sla_breached AND status NOT IN('pending','cancelled'))/NULLIF(COUNT(*) FILTER(WHERE status NOT IN('pending','cancelled')),0),1) sla_hit_rate,COUNT(*) FILTER(WHERE sla_breached) sla_breaches FROM orders WHERE created_at>=NOW()-INTERVAL '1 day'`),
    query(`SELECT channel,COUNT(*) orders,SUM(total) gmv,ROUND(100.0*COUNT(*) FILTER(WHERE NOT sla_breached AND status NOT IN('pending','cancelled'))/NULLIF(COUNT(*) FILTER(WHERE status NOT IN('pending','cancelled')),0),1) sla_pct FROM orders WHERE created_at>=NOW()-INTERVAL '1 day' GROUP BY channel ORDER BY orders DESC`),
    query(`SELECT s.sku_code,w.code wh,i.quantity,i.reorder_level,CASE WHEN i.quantity=0 THEN 'out' WHEN i.quantity<=i.reorder_level THEN 'low' ELSE 'healthy' END health FROM inventory i JOIN skus s ON s.id=i.sku_id JOIN warehouses w ON w.id=i.warehouse_id WHERE i.quantity<=i.reorder_level ORDER BY i.quantity ASC LIMIT 10`),
    query(`SELECT w.code,COUNT(o.id) pending_orders,COALESCE(SUM(op.picks_today),0) picks FROM warehouses w LEFT JOIN orders o ON o.warehouse_id=w.id AND o.created_at>=NOW()-INTERVAL '1 day' AND o.status IN('pending','processing') LEFT JOIN operators op ON op.warehouse_id=w.id GROUP BY w.code`)
  ]);
  const k = kpis.rows[0];
  return `LIVE DATA:\nKPIs(24h): orders=${k.orders}, gmv=₹${Number(k.gmv).toLocaleString('en-IN')}, sla=${k.sla_hit_rate}%, breaches=${k.sla_breaches}\nChannels: ${channels.rows.map(c=>`${c.channel}:${c.orders}orders,${c.sla_pct}%SLA`).join(' | ')}\nInventory alerts: ${inv.rows.length?inv.rows.map(i=>`${i.sku_code}@${i.wh}:${i.quantity}[${i.health}]`).join(', '):'none'}\nWarehouses: ${wh.rows.map(w=>`${w.code}:${w.pending_orders}pending,${w.picks}picks`).join(' | ')}`;
};

exports.insights = async (req, res) => {
  const { prompt, context: extra } = req.body;
  if (!prompt) return res.status(422).json({ error: 'prompt required' });
  let ctx; try { ctx = await buildContext(); } catch { ctx = 'Live data unavailable.'; }
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 1024,
    system: `You are Nexus AI, a commerce operations assistant. Be concise, specific, actionable. Use bullet points. Max 220 words.\n${ctx}${extra?'\nContext: '+extra:''}`,
    messages: [{ role: 'user', content: prompt }]
  });
  res.json({ response: msg.content.find(b=>b.type==='text')?.text||'', tokens: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } });
};

exports.stream = async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(422).json({ error: 'prompt required' });
  let ctx; try { ctx = await buildContext(); } catch { ctx = 'Live data unavailable.'; }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const stream = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, stream: true, system: `You are Nexus AI. Be concise and actionable.\n${ctx}`, messages: [{ role: 'user', content: prompt }] });
  for await (const ev of stream) {
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') res.write(`data: ${JSON.stringify({ text: ev.delta.text })}\n\n`);
    if (ev.type === 'message_stop') res.write('data: [DONE]\n\n');
  }
  res.end();
};
