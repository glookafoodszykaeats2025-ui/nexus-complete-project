require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { pool } = require('../src/db/pool');

const rand    = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

async function run() {
  const client = await pool.connect();
  console.log('🌱 Seeding database…');
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE courier_manifests, operators, warehouse_zones, order_events, order_items, orders, inventory, skus, warehouses, refresh_tokens, users RESTART IDENTITY CASCADE');

    // Users
    const hash = await bcrypt.hash('password123', 10);
    const users = [
      { id: uuid(), name: 'Arjun Shah',  email: 'admin@nexus.com',    role: 'admin' },
      { id: uuid(), name: 'Priya Menon', email: 'manager@nexus.com',  role: 'manager' },
      { id: uuid(), name: 'Ravi Kumar',  email: 'operator@nexus.com', role: 'operator' },
    ];
    for (const u of users) await client.query('INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)', [u.id,u.name,u.email,hash,u.role]);
    console.log('  ✓ Users');

    // Warehouses
    const whs = [
      { id: uuid(), code: 'WH-MUM-01', name: 'Mumbai Central FC',  city: 'Mumbai',    state: 'Maharashtra', pincode: '400001' },
      { id: uuid(), code: 'WH-DEL-02', name: 'Delhi NCR FC',       city: 'Gurugram',  state: 'Haryana',     pincode: '122001' },
      { id: uuid(), code: 'WH-BLR-03', name: 'Bengaluru South FC', city: 'Bengaluru', state: 'Karnataka',   pincode: '560001' },
    ];
    for (const w of whs) await client.query('INSERT INTO warehouses(id,code,name,city,state,pincode) VALUES($1,$2,$3,$4,$5,$6)', [w.id,w.code,w.name,w.city,w.state,w.pincode]);
    const whMap = {}; whs.forEach(w => whMap[w.code] = w.id);
    console.log('  ✓ Warehouses');

    // SKUs
    const skuDefs = [
      { code:'SHOE-BLK-42',    name:'Noir Runner — Black/42',     cat:'Footwear',    mrp:3499, cost:1200 },
      { code:'BAG-TAN-M',      name:'Desert Tote — Tan/M',        cat:'Bags',        mrp:2199, cost:700  },
      { code:'TEE-WHT-L',      name:'Classic Tee — White/L',      cat:'Apparel',     mrp:799,  cost:200  },
      { code:'WATCH-SLV',      name:'Tempo Watch — Silver',       cat:'Accessories', mrp:4999, cost:1800 },
      { code:'CAP-BLU-OS',     name:'Wave Cap — Blue/OS',         cat:'Accessories', mrp:599,  cost:150  },
      { code:'JEANS-IND-32',   name:'Slim Fit Jeans — Indigo/32', cat:'Apparel',     mrp:1899, cost:600  },
      { code:'JACKET-KHK-M',   name:'Field Jacket — Khaki/M',     cat:'Apparel',     mrp:3299, cost:1100 },
      { code:'SNEAKER-WHT-40', name:'Court Sneaker — White/40',   cat:'Footwear',    mrp:2799, cost:900  },
      { code:'SCARF-RED-OS',   name:'Merino Scarf — Red/OS',      cat:'Accessories', mrp:1299, cost:400  },
      { code:'SHORTS-BLK-S',   name:'Trail Short — Black/S',      cat:'Apparel',     mrp:1099, cost:350  },
    ];
    const skuIds = {};
    for (const s of skuDefs) {
      const id = uuid(); skuIds[s.code] = id;
      await client.query('INSERT INTO skus(id,sku_code,product_name,category,mrp,cost) VALUES($1,$2,$3,$4,$5,$6)', [id,s.code,s.name,s.cat,s.mrp,s.cost]);
    }
    console.log('  ✓ SKUs');

    // Inventory
    const invItems = [
      ['WH-MUM-01','SHOE-BLK-42',248,18,50], ['WH-MUM-01','BAG-TAN-M',34,12,40],
      ['WH-MUM-01','WATCH-SLV',7,7,20],      ['WH-MUM-01','JACKET-KHK-M',21,8,25],
      ['WH-DEL-02','TEE-WHT-L',512,40,100],  ['WH-DEL-02','JEANS-IND-32',88,14,50],
      ['WH-DEL-02','SCARF-RED-OS',0,0,15],   ['WH-BLR-03','CAP-BLU-OS',156,22,30],
      ['WH-BLR-03','SNEAKER-WHT-40',304,55,80],['WH-BLR-03','SHORTS-BLK-S',67,11,30],
    ];
    for (const [wc,sc,q,r,rl] of invItems) await client.query('INSERT INTO inventory(id,sku_id,warehouse_id,quantity,reserved,reorder_level) VALUES($1,$2,$3,$4,$5,$6)', [uuid(),skuIds[sc],whMap[wc],q,r,rl]);
    console.log('  ✓ Inventory');

    // Orders (60)
    const channels  = ['Amazon','Flipkart','Shopify','Myntra','Meesho'];
    const statuses  = ['shipped','shipped','shipped','packed','pending','pending','delivered','delivered','breach','cancelled'];
    const couriers  = ['Delhivery','BlueDart','Ekart','XpressBees','DTDC'];
    const customers = ['Priya Sharma','Karan Mehta','Ritu Nair','Suresh Pillai','Ananya Rao','Dev Oberoi','Sneha Kulkarni','Rohit Jain','Meera Singh','Aarav Gupta','Nisha Patel','Vikram Das','Kavya Iyer','Arjun Nair','Pooja Sharma','Rahul Verma'];
    const skuList   = Object.keys(skuIds);
    const whList    = whs.map(w => w.id);
    const adminId   = users[0].id;

    for (let i = 0; i < 60; i++) {
      const oid = uuid(); const num = `ORD-${8800+i}`;
      const ch  = rand(channels); const st = rand(statuses);
      const whId = rand(whList);
      const courier = (st==='shipped'||st==='delivered') ? rand(couriers) : null;
      const awb = courier ? `${courier.slice(0,3).toUpperCase()}${randInt(100000000,999999999)}` : null;
      const sla = new Date(Date.now() + randInt(-12,24)*3600000);
      const breached = st==='breach' || (st==='pending' && sla < new Date());
      const total = randInt(699,9999);
      await client.query(`INSERT INTO orders(id,order_number,channel,channel_order_id,customer_name,status,payment_status,subtotal,shipping_fee,total,warehouse_id,courier,awb_number,sla_deadline,sla_breached,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'paid',$7,49,$8,$9,$10,$11,$12,$13,$14,$14)`,
        [oid,num,ch,`${ch.toUpperCase()}-${randInt(10000,99999)}`,rand(customers),breached?'breach':st,total-49,total,whId,courier,awb,sla,breached,daysAgo(randInt(0,7))]);
      for (let j = 0; j < randInt(1,3); j++) {
        const sc = rand(skuList); const sku = skuDefs.find(s=>s.code===sc);
        await client.query('INSERT INTO order_items(id,order_id,sku_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5)', [uuid(),oid,skuIds[sc],randInt(1,2),sku.mrp]);
      }
      const evts = [['order_received',`Received from ${ch}`]];
      if (!['pending','breach'].includes(st)) evts.push(['processing_started','Picking started']);
      if (['packed','shipped','delivered'].includes(st)) evts.push(['packed','Packed and ready']);
      if (['shipped','delivered'].includes(st)) evts.push(['shipped',`Shipped via ${courier}, AWB: ${awb}`]);
      if (st==='delivered') evts.push(['delivered','Delivered to customer']);
      if (breached) evts.push(['sla_breach','SLA deadline exceeded']);
      for (const [t,d] of evts) await client.query('INSERT INTO order_events(id,order_id,event_type,description,actor_id) VALUES($1,$2,$3,$4,$5)', [uuid(),oid,t,d,adminId]);
    }
    console.log('  ✓ Orders (60)');

    // Zones
    const zoneIds = {};
    for (const w of whs) for (const z of ['A','B','C','D']) {
      const zid = uuid(); zoneIds[`${w.code}-${z}`] = zid;
      await client.query('INSERT INTO warehouse_zones(id,warehouse_id,code,name) VALUES($1,$2,$3,$4)', [zid,w.id,z,`Zone ${z}`]);
    }

    // Operators
    const ops = [
      ['Ramesh Kumar','WH-MUM-01','A','active',142], ['Priya Shetty','WH-MUM-01','B','packing',98],
      ['Arjun Mane','WH-MUM-01','C','break',76],     ['Meena Rao','WH-MUM-01','D','active',115],
      ['Sunil Tiwari','WH-DEL-02','A','active',188], ['Geeta Sharma','WH-DEL-02','B','active',155],
      ['Kavita Nair','WH-BLR-03','A','active',201],  ['Deepak Reddy','WH-BLR-03','B','break',92],
    ];
    for (const [name,wh,z,st,p] of ops) await client.query('INSERT INTO operators(id,name,warehouse_id,zone_id,status,picks_today) VALUES($1,$2,$3,$4,$5,$6)', [uuid(),name,whMap[wh],zoneIds[`${wh}-${z}`],st,p]);
    console.log('  ✓ Zones & Operators');

    // Manifests
    const manifests = [
      ['WH-MUM-01','Delhivery',38,'ready'],    ['WH-MUM-01','BlueDart',22,'scanning'],
      ['WH-MUM-01','Ekart',41,'pending'],       ['WH-MUM-01','XpressBees',17,'ready'],
      ['WH-DEL-02','Delhivery',55,'dispatched'],['WH-BLR-03','Ekart',44,'ready'],
    ];
    for (const [wh,courier,bags,st] of manifests) await client.query('INSERT INTO courier_manifests(id,warehouse_id,courier_name,bag_count,status) VALUES($1,$2,$3,$4,$5)', [uuid(),whMap[wh],courier,bags,st]);
    console.log('  ✓ Manifests');

    await client.query('COMMIT');
    console.log('\n✅ Seed complete!\n');
    console.log('Test credentials:');
    console.log('  admin@nexus.com    / password123  (admin)');
    console.log('  manager@nexus.com  / password123  (manager)');
    console.log('  operator@nexus.com / password123  (operator)\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally { client.release(); await pool.end(); }
}
run();
