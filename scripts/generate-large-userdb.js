/**
 * generate-large-userdb.js
 * Creates a large SQLite user database with ~50,000 rows of realistic sales data
 * for testing the DB Management feature.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// ─── Config ─────────────────────────────────────────────────────────────────
const TARGET_ROWS = 50000;
const DB_ID = 'udb_large_sales_demo';
const DB_NAME = 'large_sales_demo';
const DATA_DIR = path.join(process.cwd(), 'datellData');
const USERDB_DIR = path.join(DATA_DIR, 'userdb');
const DB_PATH = path.join(USERDB_DIR, `${DB_ID}.db`);
const REGISTRY_PATH = path.join(USERDB_DIR, 'registry.json');

// ─── Seed data ───────────────────────────────────────────────────────────────
const CATEGORIES = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books', 'Toys', 'Food & Beverage', 'Automotive', 'Health & Beauty', 'Office Supplies'];
const PRODUCTS = {
  'Electronics':    ['Laptop Pro X1', 'Wireless Headphones', 'Smart Watch S5', 'Tablet Ultra', 'USB-C Hub', 'Webcam HD', 'Bluetooth Speaker', 'SSD 1TB', 'Gaming Mouse', 'Monitor 27"'],
  'Clothing':       ['Winter Jacket', 'Running Shoes', 'Casual T-Shirt', 'Denim Jeans', 'Dress Shirt', 'Yoga Pants', 'Sneakers Air', 'Wool Sweater', 'Shorts Active', 'Leather Belt'],
  'Home & Garden':  ['Coffee Maker', 'Air Purifier', 'Robot Vacuum', 'LED Plant Light', 'Compost Bin', 'Garden Hose', 'Kitchen Knife Set', 'Bamboo Cutting Board', 'Smart Thermostat', 'Candle Set'],
  'Sports':         ['Yoga Mat', 'Dumbbell 20kg', 'Resistance Bands', 'Foam Roller', 'Jump Rope', 'Pull-up Bar', 'Tennis Racket', 'Cycling Helmet', 'Swim Goggles', 'Protein Shaker'],
  'Books':          ['JavaScript Deep Dive', 'Data Science Handbook', 'The Art of Leadership', 'Clean Code', 'Python Cookbook', 'System Design', 'Machine Learning', 'Atomic Habits', 'Thinking Fast', 'Side Hustle'],
  'Toys':           ['LEGO City Set', 'RC Car Pro', 'Puzzle 1000pc', 'Board Game', 'Action Figure', 'Stuffed Animal', 'Play Dough Kit', 'Building Blocks', 'Science Kit', 'Art Set'],
  'Food & Beverage':['Organic Coffee', 'Green Tea Pack', 'Protein Bar Box', 'Olive Oil Premium', 'Honey Raw', 'Vitamin C Gummies', 'Whey Protein', 'Energy Drink 24pk', 'Oat Milk 6pk', 'Dark Chocolate'],
  'Automotive':     ['Car Phone Mount', 'Jump Starter', 'Tire Inflator', 'Seat Covers', 'Dashboard Cam', 'Car Vacuum', 'LED Light Strip', 'Floor Mats', 'Engine Oil 5L', 'Car Polish Kit'],
  'Health & Beauty':['Moisturizer SPF50', 'Electric Toothbrush', 'Hair Dryer Pro', 'Face Serum', 'Shampoo Organic', 'Vitamin D3', 'Massage Gun', 'Eye Cream', 'Lip Balm Set', 'Sunscreen SPF100'],
  'Office Supplies':['Standing Desk', 'Ergonomic Chair', 'Desk Organizer', 'Wireless Keyboard', 'A4 Paper Ream', 'Printer Ink Set', 'File Cabinet', 'White Board', 'Sticky Notes', 'Label Maker'],
};
const REGIONS = ['North America', 'Europe', 'Asia Pacific', 'Latin America', 'Middle East & Africa'];
const SUB_REGIONS = {
  'North America': ['US-East', 'US-West', 'US-Central', 'Canada', 'Mexico'],
  'Europe': ['UK', 'Germany', 'France', 'Spain', 'Netherlands', 'Italy', 'Sweden'],
  'Asia Pacific': ['China', 'Japan', 'South Korea', 'India', 'Australia', 'Singapore'],
  'Latin America': ['Brazil', 'Argentina', 'Colombia', 'Chile', 'Peru'],
  'Middle East & Africa': ['UAE', 'Saudi Arabia', 'South Africa', 'Nigeria', 'Egypt'],
};
const CHANNELS = ['Online', 'Retail Store', 'Wholesale', 'Reseller', 'Direct Sales'];
const SALESPERSONS = ['Alice Johnson', 'Bob Chen', 'Carol Williams', 'David Kim', 'Emma Rodriguez', 'Frank Mueller', 'Grace Tanaka', 'Henry Patel', 'Iris Nakamura', 'James O\'Brien', 'Karen Liu', 'Leo Santos'];
const STATUSES = ['Completed', 'Completed', 'Completed', 'Refunded', 'Pending'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rand(0, arr.length - 1)]; }
function randFloat(min, max, dec = 2) { return parseFloat((Math.random() * (max - min) + min).toFixed(dec)); }

// ─── Price table (category → unit price range) ───────────────────────────────
const PRICE_RANGES = {
  'Electronics':     [29.99, 1299.99],
  'Clothing':        [9.99, 199.99],
  'Home & Garden':   [12.99, 599.99],
  'Sports':          [7.99, 349.99],
  'Books':           [4.99, 49.99],
  'Toys':            [5.99, 129.99],
  'Food & Beverage': [3.99, 79.99],
  'Automotive':      [9.99, 249.99],
  'Health & Beauty': [4.99, 89.99],
  'Office Supplies': [8.99, 999.99],
};

function genDate(baseYear = 2023) {
  const year = rand(baseYear, 2024);
  const month = String(rand(1, 12)).padStart(2, '0');
  const day = String(rand(1, 28)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────
fs.mkdirSync(USERDB_DIR, { recursive: true });

// Remove existing DB if present
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log(`Removed existing DB at ${DB_PATH}`);
}

console.log(`Creating SQLite DB at ${DB_PATH}...`);
const db = new Database(DB_PATH);

// Enable WAL for better write performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sales_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    TEXT NOT NULL,
    sale_date   TEXT NOT NULL,
    category    TEXT NOT NULL,
    product     TEXT NOT NULL,
    region      TEXT NOT NULL,
    sub_region  TEXT NOT NULL,
    channel     TEXT NOT NULL,
    salesperson TEXT NOT NULL,
    quantity    INTEGER NOT NULL,
    unit_price  REAL NOT NULL,
    amount      REAL NOT NULL,
    discount    REAL NOT NULL DEFAULT 0,
    net_amount  REAL NOT NULL,
    status      TEXT NOT NULL DEFAULT 'Completed'
  );

  CREATE INDEX IF NOT EXISTS idx_sale_date  ON sales_records(sale_date);
  CREATE INDEX IF NOT EXISTS idx_category   ON sales_records(category);
  CREATE INDEX IF NOT EXISTS idx_region     ON sales_records(region);
  CREATE INDEX IF NOT EXISTS idx_channel    ON sales_records(channel);
  CREATE INDEX IF NOT EXISTS idx_salesperson ON sales_records(salesperson);
`);

const insert = db.prepare(`
  INSERT INTO sales_records
    (order_id, sale_date, category, product, region, sub_region, channel, salesperson, quantity, unit_price, amount, discount, net_amount, status)
  VALUES
    (@order_id, @sale_date, @category, @product, @region, @sub_region, @channel, @salesperson, @quantity, @unit_price, @amount, @discount, @net_amount, @status)
`);

const insertMany = db.transaction((rows) => {
  for (const row of rows) insert.run(row);
});

const BATCH_SIZE = 1000;
let inserted = 0;

while (inserted < TARGET_ROWS) {
  const batch = [];
  const batchEnd = Math.min(inserted + BATCH_SIZE, TARGET_ROWS);
  for (let i = inserted; i < batchEnd; i++) {
    const category = pick(CATEGORIES);
    const product = pick(PRODUCTS[category]);
    const region = pick(REGIONS);
    const sub_region = pick(SUB_REGIONS[region]);
    const quantity = rand(1, 50);
    const [pMin, pMax] = PRICE_RANGES[category];
    const unit_price = randFloat(pMin, pMax);
    const amount = parseFloat((unit_price * quantity).toFixed(2));
    const discount = rand(0, 10) < 3 ? randFloat(0.05, 0.25) : 0; // 30% chance of discount
    const net_amount = parseFloat((amount * (1 - discount)).toFixed(2));
    const orderNum = String(i + 1).padStart(8, '0');
    batch.push({
      order_id:    `ORD-${orderNum}`,
      sale_date:   genDate(2023),
      category,
      product,
      region,
      sub_region,
      channel:     pick(CHANNELS),
      salesperson: pick(SALESPERSONS),
      quantity,
      unit_price,
      amount,
      discount:    parseFloat((discount * 100).toFixed(1)),
      net_amount,
      status:      pick(STATUSES),
    });
  }
  insertMany(batch);
  inserted = batchEnd;
  process.stdout.write(`\r  Inserted ${inserted}/${TARGET_ROWS} rows...`);
}
console.log(`\n✓ All ${inserted} rows inserted.`);

const rowCheck = db.prepare('SELECT COUNT(*) AS cnt FROM sales_records').get();
console.log(`✓ Row count verified: ${rowCheck.cnt}`);

db.close();

// ─── Write / update registry ──────────────────────────────────────────────────
const now = new Date().toISOString();
let registry = [];
if (fs.existsSync(REGISTRY_PATH)) {
  try { registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')); } catch { registry = []; }
}
// Remove any existing entry for this ID
registry = registry.filter(r => r.id !== DB_ID);
registry.push({
  id: DB_ID,
  name: DB_NAME,
  type: 'userdb',
  description: `Large demo dataset with ${TARGET_ROWS.toLocaleString()} sales records (2023–2024)`,
  dbPath: DB_PATH,
  createdAt: now,
  updatedAt: now,
  tableCount: 1,
});
fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
console.log(`✓ Registry written: ${REGISTRY_PATH}`);
console.log(`\nDB ready → ${DB_PATH}`);
console.log(`Registry → ${REGISTRY_PATH}`);
