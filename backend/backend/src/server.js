import 'dotenv/config';

import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Razorpay from 'razorpay';
import pool from './db.js';
import { requireAuth, requireAdmin } from './auth.js';

const app = express();
const port = Number(process.env.PORT || 5000);

const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || localOrigins.includes(origin) || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  sameSite: isProduction ? 'none' : 'lax',
  secure: isProduction,
  path: '/',
};

function issueToken(res, user) {
  const token = jwt.sign(
    { id: user.user_id, name: user.full_name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.cookie('nexora_token', token, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 });
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Enter email and password.' });
  try {
    const [[user]] = await pool.execute(
      'SELECT user_id,full_name,email,password_hash,role,is_active FROM users WHERE email=?',
      [String(email).trim().toLowerCase()]
    );
    if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials or inactive employee account.' });
    }
    issueToken(res, user);
    res.json({
      user: { id: user.user_id, name: user.full_name, email: user.email, role: user.role },
    });
  } catch (e) {
    res.status(500).json({ error: 'Login failed. Check database setup.' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('nexora_token', cookieOptions);
  res.json({ ok: true });
});

app.post('/api/admin/employees', requireAuth, requireAdmin, async (req, res) => {
  const { full_name, email, password, role = 'employee' } = req.body || {};
  if (!full_name || !email || !password || password.length < 10) {
    return res.status(400).json({ error: 'Enter name, email and a password of at least 10 characters.' });
  }
  if (!['admin', 'employee'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const [r] = await pool.execute(
      'INSERT INTO users(full_name,email,password_hash,role,is_active) VALUES(?,?,?,?,1)',
      [full_name.trim(), email.trim().toLowerCase(), hash, role]
    );
    res.status(201).json({
      user_id: r.insertId,
      full_name,
      email: email.trim().toLowerCase(),
      role,
      is_active: 1,
    });
  } catch (e) {
    res.status(400).json({
      error: e.code === 'ER_DUP_ENTRY' ? 'That email is already registered.' : 'Could not create employee.',
    });
  }
});

app.get('/api/admin/employees', requireAuth, requireAdmin, async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT user_id,full_name,email,role,is_active,created_at FROM users ORDER BY user_id'
  );
  res.json(rows);
});

app.patch('/api/admin/employees/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const active = Number(req.body?.is_active);
  if (![0, 1].includes(active)) return res.status(400).json({ error: 'Invalid status.' });
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  }
  await pool.execute('UPDATE users SET is_active=? WHERE user_id=?', [active, req.params.id]);
  res.json({ ok: true });
});

app.use('/api', requireAuth);

app.get('/api/data', async (_req, res) => {
  try {
    const [[branches], [customers], [accounts], [loans], [transactions], [auditLogs], [loanPayments]] =
      await Promise.all([
        pool.query('SELECT * FROM branches ORDER BY branch_id'),
        pool.query('SELECT * FROM customers ORDER BY customer_id'),
        pool.query('SELECT * FROM accounts ORDER BY account_number'),
        pool.query('SELECT * FROM loans ORDER BY loan_id DESC'),
        pool.query(
          "SELECT transaction_id,from_account,to_account,amount,transaction_type,status,DATE_FORMAT(transaction_date,'%d-%m-%Y %H:%i') AS date FROM transactions ORDER BY transaction_id DESC"
        ),
        pool.query(
          "SELECT log_id,account_number,action,old_balance,new_balance,DATE_FORMAT(created_at,'%d-%m-%Y %H:%i') AS date FROM audit_logs ORDER BY log_id DESC"
        ),
        pool.query(
          "SELECT payment_id,loan_id,amount,DATE_FORMAT(payment_date,'%d-%m-%Y %H:%i') AS date FROM loan_payments ORDER BY payment_id DESC"
        ),
      ]);
    res.json({ branches, customers, accounts, loans, transactions, auditLogs, loanPayments });
  } catch (e) {
    res.status(500).json({ error: 'Could not load bank data.' });
  }
});

app.post('/api/customers', async (req, res) => {
  const { first_name, last_name, pan_number, phone, email, address = '' } = req.body;
  if (!first_name || !last_name || !pan_number || !phone || !email) {
    return res.status(400).json({ error: 'Fill all required customer fields.' });
  }
  try {
    const [r] = await pool.execute(
      'INSERT INTO customers(first_name,last_name,pan_number,phone,email,address) VALUES(?,?,?,?,?,?)',
      [first_name, last_name, pan_number, phone, email, address]
    );
    const [[row]] = await pool.query('SELECT * FROM customers WHERE customer_id=?', [r.insertId]);
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({
      error: e.code === 'ER_DUP_ENTRY' ? 'PAN, phone or email already exists.' : 'Could not save customer.',
    });
  }
});

app.post('/api/branches', requireAdmin, async (req, res) => {
  const { ifsc_code, branch_name, city, state } = req.body;
  if (!ifsc_code || !branch_name || !city || !state) {
    return res.status(400).json({ error: 'Fill all branch fields.' });
  }
  try {
    const [r] = await pool.execute(
      'INSERT INTO branches(ifsc_code,branch_name,city,state) VALUES(?,?,?,?)',
      [ifsc_code, branch_name, city, state]
    );
    const [[row]] = await pool.query('SELECT * FROM branches WHERE branch_id=?', [r.insertId]);
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({
      error: e.code === 'ER_DUP_ENTRY' ? 'IFSC code already exists.' : 'Could not save branch.',
    });
  }
});

app.post('/api/accounts', async (req, res) => {
  const { customer_id, branch_id, account_type, balance = 0 } = req.body;
  if (!customer_id || !branch_id || !account_type || Number(balance) < 0) {
    return res.status(400).json({ error: 'Enter valid account details.' });
  }
  try {
    const [r] = await pool.execute(
      "INSERT INTO accounts(customer_id,branch_id,account_type,balance,status) VALUES(?,?,?,?, 'Active')",
      [customer_id, branch_id, account_type, Number(balance)]
    );
    const [[row]] = await pool.query('SELECT * FROM accounts WHERE account_number=?', [r.insertId]);
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: 'Could not create account. Check customer and branch IDs.' });
  }
});

app.post('/api/loans', async (req, res) => {
  const { customer_id, branch_id, loan_type, principal_amount, interest_rate, tenure_months = 36 } = req.body;
  if (!customer_id || !branch_id || !loan_type || Number(principal_amount) <= 0 || Number(interest_rate) < 0) {
    return res.status(400).json({ error: 'Enter valid loan details.' });
  }
  try {
    const [r] = await pool.execute(
      "INSERT INTO loans(customer_id,branch_id,loan_type,principal_amount,interest_rate,tenure_months,status) VALUES(?,?,?,?,?,?,'Under Review')",
      [customer_id, branch_id, loan_type, principal_amount, interest_rate, tenure_months]
    );
    const [[row]] = await pool.query('SELECT * FROM loans WHERE loan_id=?', [r.insertId]);
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: 'Could not save loan.' });
  }
});

// Admin: Approve, Reject, or Close a loan
app.patch('/api/loans/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!['Active', 'Rejected', 'Closed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid loan status.' });
  }
  try {
    await pool.execute('UPDATE loans SET status = ? WHERE loan_id = ?', [status, Number(req.params.id)]);
    const [[loan]] = await pool.query('SELECT * FROM loans WHERE loan_id = ?', [Number(req.params.id)]);
    if (!loan) return res.status(404).json({ error: 'Loan not found.' });
    res.json(loan);
  } catch (e) {
    res.status(400).json({ error: 'Could not update loan status.' });
  }
});

// Pay Loan EMI from an active bank account (ACID Transaction)
app.post('/api/loans/:id/pay', async (req, res) => {
  const loanId = Number(req.params.id);
  const { account_number, amount } = req.body || {};
  const value = Number(amount);

  if (!account_number || !Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ error: 'Select an account and enter a valid EMI amount.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[loan]] = await conn.query('SELECT * FROM loans WHERE loan_id = ? FOR UPDATE', [loanId]);
    if (!loan || loan.status !== 'Active') {
      throw new Error('Loan is not active or does not exist.');
    }

    const [[account]] = await conn.query(
      'SELECT * FROM accounts WHERE account_number = ? FOR UPDATE',
      [Number(account_number)]
    );
    if (!account || account.status !== 'Active' || Number(account.balance) < value) {
      throw new Error('Selected account is inactive or has insufficient balance.');
    }

    const oldBalance = Number(account.balance);
    const newBalance = oldBalance - value;

    await conn.execute('UPDATE accounts SET balance = ? WHERE account_number = ?', [
      newBalance,
      account.account_number,
    ]);
    await conn.execute(
      'INSERT INTO audit_logs(account_number, action, old_balance, new_balance) VALUES(?,?,?,?)',
      [account.account_number, `LOAN_EMI_#${loanId}`, oldBalance, newBalance]
    );
    const [txRes] = await conn.execute(
      'INSERT INTO transactions(from_account, to_account, amount, transaction_type, status) VALUES(?,?,?,?,?)',
      [account.account_number, null, value, 'Withdrawal', 'Success']
    );
    await conn.execute('INSERT INTO loan_payments(loan_id, amount) VALUES(?,?)', [loanId, value]);

    const [[paidRow]] = await conn.query(
      'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM loan_payments WHERE loan_id = ?',
      [loanId]
    );
    if (Number(paidRow.total_paid) >= Number(loan.principal_amount)) {
      await conn.execute("UPDATE loans SET status = 'Closed' WHERE loan_id = ?", [loanId]);
    }

    await conn.commit();

    const [[transaction]] = await pool.query(
      "SELECT transaction_id,from_account,to_account,amount,transaction_type,status,DATE_FORMAT(transaction_date,'%d-%m-%Y %H:%i') AS date FROM transactions WHERE transaction_id=?",
      [txRes.insertId]
    );
    const [[accounts], [loans], [auditLogs], [loanPayments]] = await Promise.all([
      pool.query('SELECT * FROM accounts ORDER BY account_number'),
      pool.query('SELECT * FROM loans ORDER BY loan_id DESC'),
      pool.query(
        "SELECT log_id,account_number,action,old_balance,new_balance,DATE_FORMAT(created_at,'%d-%m-%Y %H:%i') AS date FROM audit_logs ORDER BY log_id DESC"
      ),
      pool.query(
        "SELECT payment_id,loan_id,amount,DATE_FORMAT(payment_date,'%d-%m-%Y %H:%i') AS date FROM loan_payments ORDER BY payment_id DESC"
      ),
    ]);

    res.status(201).json({ transaction, accounts, loans, auditLogs, loanPayments });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: e.message });
  } finally {
    conn.release();
  }
});

app.post('/api/transactions', async (req, res) => {
  const { type, from_account, to_account, amount } = req.body;
  const value = Number(amount);
  if (!['Deposit', 'Withdrawal', 'Transfer'].includes(type) || !Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ error: 'Choose a valid operation and amount.' });
  }
  if (type !== 'Deposit' && !from_account) return res.status(400).json({ error: 'Select a source account.' });
  if (type === 'Transfer' && (!to_account || String(from_account) === String(to_account))) {
    return res.status(400).json({ error: 'Select a different destination account.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const ids = [
      ...new Set([
        type === 'Deposit' ? Number(to_account || from_account) : Number(from_account),
        ...(type === 'Transfer' ? [Number(to_account)] : []),
      ]),
    ]
      .filter(Boolean)
      .sort((a, b) => a - b);

    const [rows] = await conn.query(
      `SELECT * FROM accounts WHERE account_number IN (${ids.map(() => '?').join(',')}) ORDER BY account_number FOR UPDATE`,
      ids
    );
    const byId = new Map(rows.map((x) => [String(x.account_number), x]));
    const source = byId.get(String(from_account));
    const targetId = type === 'Deposit' ? to_account || from_account : to_account;
    const target = byId.get(String(targetId));

    if (type !== 'Deposit' && (!source || source.status !== 'Active' || Number(source.balance) < value)) {
      throw new Error('Source account is inactive, missing or has insufficient balance.');
    }
    if (type !== 'Withdrawal' && (!target || target.status !== 'Active')) {
      throw new Error('Destination account is inactive or does not exist.');
    }

    if (type !== 'Deposit') {
      const old = Number(source.balance);
      const next = old - value;
      await conn.execute('UPDATE accounts SET balance=? WHERE account_number=?', [next, source.account_number]);
      await conn.execute(
        'INSERT INTO audit_logs(account_number,action,old_balance,new_balance) VALUES(?,?,?,?)',
        [source.account_number, type === 'Transfer' ? 'TRANSFER_DEBIT' : 'WITHDRAWAL', old, next]
      );
    }
    if (type !== 'Withdrawal') {
      const old = Number(target.balance);
      const next = old + value;
      await conn.execute('UPDATE accounts SET balance=? WHERE account_number=?', [next, target.account_number]);
      await conn.execute(
        'INSERT INTO audit_logs(account_number,action,old_balance,new_balance) VALUES(?,?,?,?)',
        [target.account_number, type === 'Transfer' ? 'TRANSFER_CREDIT' : 'DEPOSIT', old, next]
      );
    }

    const [result] = await conn.execute(
      'INSERT INTO transactions(from_account,to_account,amount,transaction_type,status) VALUES(?,?,?,?,?)',
      [
        type === 'Deposit' ? null : Number(from_account),
        type === 'Withdrawal' ? null : Number(targetId),
        value,
        type,
        'Success',
      ]
    );
    await conn.commit();

    const [[transaction]] = await pool.query(
      "SELECT transaction_id,from_account,to_account,amount,transaction_type,status,DATE_FORMAT(transaction_date,'%d-%m-%Y %H:%i') AS date FROM transactions WHERE transaction_id=?",
      [result.insertId]
    );
    const [accounts] = await pool.query('SELECT * FROM accounts ORDER BY account_number');
    const [auditLogs] = await pool.query(
      "SELECT log_id,account_number,action,old_balance,new_balance,DATE_FORMAT(created_at,'%d-%m-%Y %H:%i') AS date FROM audit_logs ORDER BY log_id DESC"
    );
    res.status(201).json({ transaction, accounts, auditLogs });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// Razorpay: Create Order
app.post('/api/payments/create-order', async (req, res) => {
  if (!razorpay) return res.status(503).json({ error: 'Razorpay is not configured on the server.' });

  const { account_number, amount } = req.body || {};
  const value = Number(amount);

  if (!account_number || !Number.isFinite(value) || value < 1) {
    return res.status(400).json({ error: 'Enter a valid account and amount (minimum ₹1).' });
  }

  try {
    const [[account]] = await pool.query(
      'SELECT account_number, status FROM accounts WHERE account_number = ?',
      [Number(account_number)]
    );
    if (!account || account.status !== 'Active') {
      return res.status(400).json({ error: 'Target account is inactive or does not exist.' });
    }

    const amountPaise = Math.round(value * 100);
    const rzpOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `nxr_${account.account_number}_${Date.now()}`.slice(0, 40),
    });

    await pool.execute(
      'INSERT INTO payment_orders(razorpay_order_id, account_number, amount, status, created_by) VALUES(?,?,?,?,?)',
      [rzpOrder.id, account.account_number, value, 'Created', req.user.id]
    );

    res.status(201).json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not initialize Razorpay order.' });
  }
});

// Razorpay: Verify Signature & Credit Account
app.post('/api/payments/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification details.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[order]] = await conn.query(
      'SELECT * FROM payment_orders WHERE razorpay_order_id = ? FOR UPDATE',
      [razorpay_order_id]
    );
    if (!order) throw new Error('Payment order not found.');
    if (order.status === 'Paid') throw new Error('This payment has already been processed.');

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${order.razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const isValid =
      expected.length === razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));

    if (!isValid) {
      await conn.execute('UPDATE payment_orders SET status = ? WHERE order_id = ?', ['Failed', order.order_id]);
      await conn.commit();
      return res.status(400).json({ error: 'Invalid payment signature.' });
    }

    const [[account]] = await conn.query(
      'SELECT * FROM accounts WHERE account_number = ? FOR UPDATE',
      [order.account_number]
    );
    if (!account || account.status !== 'Active') {
      throw new Error('Target account is inactive or missing.');
    }

    const oldBalance = Number(account.balance);
    const depositAmount = Number(order.amount);
    const newBalance = oldBalance + depositAmount;

    await conn.execute('UPDATE accounts SET balance = ? WHERE account_number = ?', [
      newBalance,
      account.account_number,
    ]);
    await conn.execute(
      'INSERT INTO audit_logs(account_number, action, old_balance, new_balance) VALUES(?,?,?,?)',
      [account.account_number, 'RAZORPAY_DEPOSIT', oldBalance, newBalance]
    );
    const [txResult] = await conn.execute(
      'INSERT INTO transactions(from_account, to_account, amount, transaction_type, status) VALUES(?,?,?,?,?)',
      [null, account.account_number, depositAmount, 'Deposit', 'Success']
    );
    await conn.execute(
      'UPDATE payment_orders SET status = ?, razorpay_payment_id = ?, paid_at = NOW() WHERE order_id = ?',
      ['Paid', razorpay_payment_id, order.order_id]
    );

    await conn.commit();

    const [[transaction]] = await pool.query(
      "SELECT transaction_id,from_account,to_account,amount,transaction_type,status,DATE_FORMAT(transaction_date,'%d-%m-%Y %H:%i') AS date FROM transactions WHERE transaction_id=?",
      [txResult.insertId]
    );
    const [accounts] = await pool.query('SELECT * FROM accounts ORDER BY account_number');
    const [auditLogs] = await pool.query(
      "SELECT log_id,account_number,action,old_balance,new_balance,DATE_FORMAT(created_at,'%d-%m-%Y %H:%i') AS date FROM audit_logs ORDER BY log_id DESC"
    );

    res.status(201).json({ transaction, accounts, auditLogs });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: e.message });
  } finally {
    conn.release();
  }
});

app.listen(port, () => console.log(`Nexora Bank API running at http://localhost:${port}`));
