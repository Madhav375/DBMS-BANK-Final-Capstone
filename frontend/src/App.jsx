const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

import React, { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { Layout, Intro, Button, Field, Table, Status, Foot, money } from "./components";
import { Plus, ArrowLeftRight, WalletCards, Users, Building2 } from "lucide-react";

const CreditCardIcon = WalletCards;
const LandmarkIcon = Building2;

function calcEMI(principal, annualRate, months) {
  const P = Number(principal) || 0;
  const n = Number(months) || 36;
  const r = (Number(annualRate) || 0) / 12 / 100;
  if (r === 0) return P / n;
  return (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function Dashboard({ d, user }) {
  let go = useNavigate();
  let total = d.accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  let recent = d.transactions.slice(0, 5);

  return (
    <>
      <div className="welcome dashboard-welcome">
        <div>
          <h2>Welcome back, {user?.name || "Employee"}</h2>
          <p>Your banking overview</p>
        </div>
        <div className="dash-actions">
          <Button onClick={() => go("/accounts")} kind="secondary">
            <Plus size={17} /> Add Account
          </Button>
          <Button onClick={() => go("/money-operations")}>
            <ArrowLeftRight size={17} /> New Transaction
          </Button>
        </div>
      </div>

      <div className="stat-grid dashboard-stats">
        {[
          ["Total Customer Balance", money(total), "blue", WalletCards],
          ["Registered Customers", d.customers.length, "green", Users],
          ["Bank Accounts", d.accounts.length, "purple", CreditCardIcon],
          ["Loan Records", d.loans.length, "teal", LandmarkIcon],
        ].map(([label, value, color, Icon]) => (
          <div className="stat-card" key={label}>
            <div className={"dash-stat-icon " + color}>
              <Icon size={24} />
            </div>
            <div className="stat-top">{label}</div>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <section className="panel recent-panel">
        <div className="recent-head">
          <h3>
            <ArrowLeftRight size={20} /> Recent Transactions
          </h3>
          <button onClick={() => go("/transactions")}>View All →</button>
        </div>
        <Table
          cols={["Date & Time", "Transaction ID", "Type", "Account No.", "Amount", "Status"]}
          rows={recent.map((t) => (
            <tr key={t.transaction_id}>
              <td>{t.date || "—"}</td>
              <td>TXN{t.transaction_id}</td>
              <td>
                <span className={"transaction-pill " + String(t.transaction_type || t.type || "").toLowerCase()}>
                  {t.transaction_type || t.type || "—"}
                </span>
              </td>
              <td>{t.from_account || t.to_account || t.account_number || "—"}</td>
              <td>{money(t.amount)}</td>
              <td>
                <span className="complete-status">● {t.status || "Completed"}</span>
              </td>
            </tr>
          ))}
        />
      </section>
    </>
  );
}

function Entity({ title, subtitle, kind, d, setD, notify }) {
  let [open, O] = useState(false);
  let [search, S] = useState("");
  let [f, F] = useState({
    first_name: "",
    last_name: "",
    pan_number: "",
    phone: "",
    email: "",
    ifsc_code: "",
    branch_name: "",
    city: "",
    state: "",
    customer_id: "",
    branch_id: "1",
    account_type: "Savings",
    balance: "1000",
  });

  let fields =
    kind === "customers"
      ? ["first_name", "last_name", "pan_number", "phone", "email"]
      : kind === "branches"
      ? ["ifsc_code", "branch_name", "city", "state"]
      : ["customer_id", "branch_id", "account_type", "balance"];

  let list =
    kind === "customers"
      ? d.customers
      : kind === "branches"
      ? d.branches
      : d.accounts;

  let filtered = list.filter((x) =>
    Object.values(x).join(" ").toLowerCase().includes(search.toLowerCase())
  );

  async function save(e) {
    e.preventDefault();
    let body = { ...f };
    try {
      let response = await fetch(`${API_BASE}/api/${kind}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save record.");
      setD((p) => [result, ...p]);
      O(false);
      notify("Record saved in MySQL successfully.");
    } catch (error) {
      notify(error.message);
    }
  }

  let cols =
    kind === "customers"
      ? ["customer_id", "first_name", "last_name", "pan_number", "phone", "email"]
      : kind === "branches"
      ? ["branch_id", "ifsc_code", "branch_name", "city", "state"]
      : ["account_number", "customer_id", "branch_id", "account_type", "balance", "status"];

  return (
    <>
      <Intro
        title={title}
        subtitle={subtitle}
        action={
          <Button onClick={() => O(!open)}>
            <Plus size={16} /> Add{" "}
            {kind === "accounts"
              ? "account"
              : kind === "customers"
              ? "customer"
              : "branch"}
          </Button>
        }
      />
      {open && (
        <section className="panel">
          <form className="form-grid" onSubmit={save}>
            {fields.map((k) => (
              <Field
                key={k}
                label={k.replaceAll("_", " ")}
                value={f[k]}
                onChange={(v) => F({ ...f, [k]: v })}
                required
                type={k === "balance" ? "number" : "text"}
              />
            ))}
            <div className="form-actions">
              <Button type="submit">Save record</Button>
            </div>
          </form>
        </section>
      )}
      <section className="panel">
        <input
          className="wide-search"
          placeholder={"Search " + kind + "..."}
          value={search}
          onChange={(e) => S(e.target.value)}
        />
        <Table
          cols={cols.map((x) => x.replaceAll("_", " "))}
          rows={filtered.map((r, i) => (
            <tr key={r[cols[0]] || i}>
              {cols.map((c) => (
                <td key={c}>
                  {c === "balance" ? (
                    money(r[c])
                  ) : c === "status" ? (
                    <Status value={r[c]} />
                  ) : (
                    r[c] ?? "—"
                  )}
                </td>
              ))}
            </tr>
          ))}
        />
        <Foot n={filtered.length} label={kind} />
      </section>
    </>
  );
}

function LoansManager({ d, user, setLoans, setAccounts, setTransactions, setAuditLogs, setLoanPayments, notify }) {
  const [open, setOpen] = useState(false);
  const [payLoan, setPayLoan] = useState(null);
  const [payAcc, setPayAcc] = useState("");
  const [payAmt, setPayAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    customer_id: "",
    branch_id: "1",
    loan_type: "Personal",
    principal_amount: "100000",
    interest_rate: "9.5",
    tenure_months: "36",
  });

  const paidByLoan = d.loanPayments.reduce((acc, p) => {
    acc[p.loan_id] = (acc[p.loan_id] || 0) + Number(p.amount);
    return acc;
  }, {});

  async function createLoan(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/loans`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create loan.");
      setLoans((p) => [data, ...p]);
      setOpen(false);
      notify("Loan application submitted (Under Review).");
    } catch (err) {
      notify(err.message);
    }
  }

  async function updateStatus(loanId, status) {
    try {
      const res = await fetch(`${API_BASE}/api/loans/${loanId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || "Status update failed.");
      setLoans((p) => p.map((l) => (l.loan_id === loanId ? updated : l)));
      notify(`Loan #${loanId} marked as ${status}.`);
    } catch (err) {
      notify(err.message);
    }
  }

  async function submitEMI(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/loans/${payLoan.loan_id}/pay`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_number: payAcc, amount: payAmt }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "EMI payment failed.");
      setAccounts(result.accounts);
      setLoans(result.loans);
      setTransactions((p) => [result.transaction, ...p]);
      setAuditLogs(result.auditLogs);
      setLoanPayments(result.loanPayments);
      setPayLoan(null);
      notify("EMI payment recorded successfully.");
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  const previewEMI = calcEMI(f.principal_amount, f.interest_rate, f.tenure_months);

  return (
    <>
      <Intro
        title="Loan Management"
        subtitle="Sanction loans, track repayment progress, and process monthly EMIs."
        action={
          <Button onClick={() => setOpen(!open)}>
            <Plus size={16} /> New Loan Application
          </Button>
        }
      />

      {open && (
        <section className="panel">
          <form className="form-grid" onSubmit={createLoan}>
            <Field label="Customer" value={f.customer_id} onChange={(v) => setF({ ...f, customer_id: v })} required>
              <select required value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
                <option value="">Select customer</option>
                {d.customers.map((c) => (
                  <option key={c.customer_id} value={c.customer_id}>
                    #{c.customer_id} · {c.first_name} {c.last_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Branch" value={f.branch_id} onChange={(v) => setF({ ...f, branch_id: v })} required>
              <select required value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
                {d.branches.map((b) => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Loan Type" value={f.loan_type} onChange={(v) => setF({ ...f, loan_type: v })} required>
              <select value={f.loan_type} onChange={(e) => setF({ ...f, loan_type: e.target.value })}>
                {["Home", "Auto", "Education", "Personal", "Business"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Principal (₹)"
              type="number"
              value={f.principal_amount}
              onChange={(v) => setF({ ...f, principal_amount: v })}
              required
            />
            <Field
              label="Interest Rate (%)"
              type="number"
              value={f.interest_rate}
              onChange={(v) => setF({ ...f, interest_rate: v })}
              required
            />
            <Field
              label="Tenure (Months)"
              type="number"
              value={f.tenure_months}
              onChange={(v) => setF({ ...f, tenure_months: v })}
              required
            />
            <div className="emi-preview">
              Estimated Monthly EMI: <strong>{money(previewEMI)}</strong>
            </div>
            <div className="form-actions">
              <Button type="submit">Submit Application</Button>
            </div>
          </form>
        </section>
      )}

      {payLoan && (
        <section className="panel emi-box">
          <h3>
            Pay EMI for Loan #{payLoan.loan_id} ({payLoan.loan_type})
          </h3>
          <form className="form-grid" onSubmit={submitEMI}>
            <Field label="Debit Account" value={payAcc} onChange={setPayAcc} required>
              <select required value={payAcc} onChange={(e) => setPayAcc(e.target.value)}>
                <option value="">Select active account</option>
                {d.accounts
                  .filter((a) => a.status === "Active")
                  .map((a) => (
                    <option key={a.account_number} value={a.account_number}>
                      {a.account_number} · {money(a.balance)}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="EMI Amount (₹)" type="number" value={payAmt} onChange={setPayAmt} required />
            <div className="form-actions">
              <Button type="submit" disabled={busy}>
                {busy ? "Processing..." : "Confirm EMI Payment"}
              </Button>
              <Button type="button" kind="secondary" onClick={() => setPayLoan(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <Table
          cols={["Loan ID", "Customer", "Type", "Principal", "Monthly EMI", "Repaid", "Status", "Actions"]}
          rows={d.loans.map((l) => {
            const cust = d.customers.find((c) => c.customer_id === l.customer_id);
            const emi = calcEMI(l.principal_amount, l.interest_rate, l.tenure_months);
            const paid = paidByLoan[l.loan_id] || 0;
            const pct = Math.min(100, Math.round((paid / Number(l.principal_amount)) * 100));
            return (
              <tr key={l.loan_id}>
                <td>#{l.loan_id}</td>
                <td>{cust ? `${cust.first_name} ${cust.last_name}` : `ID ${l.customer_id}`}</td>
                <td>
                  {l.loan_type} ({l.interest_rate}%)
                </td>
                <td>{money(l.principal_amount)}</td>
                <td>
                  <strong>{money(emi)}</strong> / mo
                </td>
                <td>
                  <div>
                    {money(paid)} ({pct}%)
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </td>
                <td>
                  <Status value={l.status} />
                </td>
                <td className="action-cell">
                  {l.status === "Under Review" && user?.role === "admin" && (
                    <>
                      <button className="mini-btn approve" onClick={() => updateStatus(l.loan_id, "Active")}>
                        Approve
                      </button>
                      <button className="mini-btn reject" onClick={() => updateStatus(l.loan_id, "Rejected")}>
                        Reject
                      </button>
                    </>
                  )}
                  {l.status === "Active" && (
                    <button
                      className="mini-btn pay"
                      onClick={() => {
                        setPayLoan(l);
                        setPayAmt(Math.round(emi));
                        setPayAcc("");
                      }}
                    >
                      Pay EMI
                    </button>
                  )}
                  {l.status === "Closed" && <span className="muted">Paid off</span>}
                </td>
              </tr>
            );
          })}
        />
      </section>
    </>
  );
}

function Transactions({ d }) {
  return (
    <>
      <Intro
        title="Transaction history"
        subtitle="TRANSACTION table: from/to account, amount, type and status."
      />
      <section className="panel">
        <Table
          cols={["Transaction ID", "From account", "To account", "Amount", "Type", "Status", "Date"]}
          rows={d.transactions.map((t) => (
            <tr key={t.transaction_id}>
              <td>{t.transaction_id}</td>
              <td>{t.from_account || "—"}</td>
              <td>{t.to_account || "—"}</td>
              <td>{money(t.amount)}</td>
              <td>{t.transaction_type}</td>
              <td>{t.status}</td>
              <td>{t.date}</td>
            </tr>
          ))}
        />
      </section>
    </>
  );
}

function Audit({ d }) {
  return (
    <>
      <Intro title="Audit log" subtitle="AUDIT_LOG table: account actions and balance changes." />
      <section className="panel">
        <Table
          cols={["Log ID", "Account", "Action", "Old balance", "New balance", "Date"]}
          rows={d.auditLogs.map((l) => (
            <tr key={l.log_id}>
              <td>{l.log_id}</td>
              <td>{l.account_number}</td>
              <td>{l.action}</td>
              <td>{money(l.old_balance)}</td>
              <td>{money(l.new_balance)}</td>
              <td>{l.date}</td>
            </tr>
          ))}
        />
      </section>
    </>
  );
}

function Reports({ d }) {
  const totalBalance = d.accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const activeLoans = d.loans.filter((l) => l.status === "Active");
  const loanPortfolio = activeLoans.reduce((s, l) => s + Number(l.principal_amount || 0), 0);

  const totalsByType = { Deposit: 0, Withdrawal: 0, Transfer: 0 };
  d.transactions.forEach((t) => {
    if (totalsByType[t.transaction_type] !== undefined) {
      totalsByType[t.transaction_type] += Number(t.amount || 0);
    }
  });
  const maxTx = Math.max(1, ...Object.values(totalsByType));

  const branchStats = d.branches
    .map((b) => {
      const bal = d.accounts
        .filter((a) => a.branch_id === b.branch_id)
        .reduce((s, a) => s + Number(a.balance || 0), 0);
      return { name: b.branch_name, city: b.city, balance: bal };
    })
    .sort((a, b) => b.balance - a.balance);
  const maxBranch = Math.max(1, ...branchStats.map((b) => b.balance));

  const accountTypes = ["Savings", "Current", "Fixed Deposit"].map((type) => {
    const matching = d.accounts.filter((a) => a.account_type === type);
    return {
      type,
      count: matching.length,
      balance: matching.reduce((s, a) => s + Number(a.balance || 0), 0),
    };
  });

  return (
    <>
      <Intro
        title="Analytics & Reports"
        subtitle="Real-time liquidity, transaction volume, and branch performance."
      />

      <div className="stat-grid">
        {[
          ["Total Liquidity", money(totalBalance)],
          ["Active Loan Portfolio", money(loanPortfolio)],
          ["Total Deposits", money(totalsByType.Deposit)],
          ["Total Withdrawals", money(totalsByType.Withdrawal)],
        ].map(([label, val]) => (
          <div className="stat-card" key={label}>
            <div className="stat-top">{label}</div>
            <strong>{val}</strong>
          </div>
        ))}
      </div>

      <div className="analytics-grid">
        <section className="panel">
          <h3>Transaction Volume by Type</h3>
          <div className="bar-chart">
            {Object.entries(totalsByType).map(([type, val]) => (
              <div className="bar-row" key={type}>
                <div className="bar-meta">
                  <span>{type}</span>
                  <strong>{money(val)}</strong>
                </div>
                <div className="progress-track lg">
                  <div
                    className={`progress-fill ${type.toLowerCase()}`}
                    style={{ width: `${Math.round((val / maxTx) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3>Branch Liquidity Breakdown</h3>
          <div className="bar-chart">
            {branchStats.map((b) => (
              <div className="bar-row" key={b.name}>
                <div className="bar-meta">
                  <span>
                    {b.name} ({b.city})
                  </span>
                  <strong>{money(b.balance)}</strong>
                </div>
                <div className="progress-track lg">
                  <div
                    className="progress-fill branch"
                    style={{ width: `${Math.round((b.balance / maxBranch) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <h3>Account Distribution</h3>
        <Table
          cols={["Account Type", "Total Accounts", "Combined Balance", "Share of Liquidity"]}
          rows={accountTypes.map((a) => (
            <tr key={a.type}>
              <td>
                <strong>{a.type}</strong>
              </td>
              <td>{a.count}</td>
              <td>{money(a.balance)}</td>
              <td>{totalBalance ? `${Math.round((a.balance / totalBalance) * 100)}%` : "0%"}</td>
            </tr>
          ))}
        />
      </section>
    </>
  );
}

function MoneyOps({ d, setAccounts, setTransactions, setAuditLogs, notify }) {
  const [type, T] = useState("Deposit");
  const [from, F] = useState("");
  const [to, TO] = useState("");
  const [amount, A] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleRazorpayDeposit() {
    if (!window.Razorpay) {
      notify("Razorpay SDK not loaded. Check index.html or your internet connection.");
      return;
    }

    setBusy(true);
    try {
      const orderRes = await fetch(`${API_BASE}/api/payments/create-order`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_number: from, amount }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error || "Could not create Razorpay order.");

      const acc = d.accounts.find((a) => String(a.account_number) === String(from));
      const cust = acc ? d.customers.find((c) => c.customer_id === acc.customer_id) : null;

      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Nexora Bank",
        description: `Online Deposit to A/C ${from}`,
        order_id: order.orderId,
        prefill: cust
          ? {
              name: `${cust.first_name} ${cust.last_name}`,
              email: cust.email,
              contact: cust.phone,
            }
          : undefined,
        theme: { color: "#173b63" },
        handler: async (response) => {
          try {
            const verifyRes = await fetch(`${API_BASE}/api/payments/verify`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const result = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(result.error || "Payment verification failed.");

            setAccounts(result.accounts);
            setTransactions((p) => [result.transaction, ...p]);
            setAuditLogs(result.auditLogs);
            A("");
            notify("Online deposit verified and credited to account!");
          } catch (err) {
            notify(err.message);
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp) => {
        setBusy(false);
        notify(resp.error?.description || "Payment failed or was cancelled.");
      });
      rzp.open();
    } catch (error) {
      setBusy(false);
      notify(error.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (type === "Online Deposit") {
      await handleRazorpayDeposit();
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/api/transactions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          from_account: from,
          to_account: type === "Deposit" ? from : to,
          amount,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Transaction failed.");

      setAccounts(result.accounts);
      setTransactions((p) => [result.transaction, ...p]);
      setAuditLogs(result.auditLogs);
      A("");
      notify("Transaction saved in MySQL successfully.");
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }

  const isDeposit = type === "Deposit" || type === "Online Deposit";

  return (
    <>
      <Intro
        title="Money operations"
        subtitle="Deposits, withdrawals, transfers, and Razorpay online deposits."
      />
      <section className="panel">
        <div className="tabs">
          {["Deposit", "Withdrawal", "Transfer", "Online Deposit"].map((t) => (
            <button
              type="button"
              className={type === t ? "selected" : ""}
              key={t}
              onClick={() => T(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <form className="form-grid" onSubmit={submit}>
          <Field
            label={isDeposit ? "Deposit account" : "From account"}
            value={from}
            onChange={F}
            required
          >
            <select required value={from} onChange={(e) => F(e.target.value)}>
              <option value="">Select account</option>
              {d.accounts
                .filter((a) => a.status === "Active")
                .map((a) => (
                  <option key={a.account_number} value={a.account_number}>
                    {a.account_number} · {money(a.balance)}
                  </option>
                ))}
            </select>
          </Field>

          {type === "Transfer" && (
            <Field label="To account" value={to} onChange={TO} required>
              <select required value={to} onChange={(e) => TO(e.target.value)}>
                <option value="">Select destination</option>
                {d.accounts
                  .filter(
                    (a) =>
                      a.status === "Active" && String(a.account_number) !== from
                  )
                  .map((a) => (
                    <option key={a.account_number} value={a.account_number}>
                      {a.account_number}
                    </option>
                  ))}
              </select>
            </Field>
          )}

          <Field
            label="Amount (₹)"
            type="number"
            value={amount}
            onChange={A}
            required
          />

          <div className="form-actions">
            <Button type="submit" disabled={busy}>
              {busy
                ? "Processing..."
                : type === "Online Deposit"
                ? "Pay with Razorpay"
                : `Confirm ${type.toLowerCase()}`}
            </Button>
          </div>
        </form>
        <p className="demo-warning">
          {type === "Online Deposit"
            ? "Razorpay Test Mode: Use test UPI (success@razorpay) or test cards to simulate deposits."
            : "Please verify transaction details before confirming."}
        </p>
      </section>
    </>
  );
}

function BankApp({ user }) {
  let [branches, setBranches] = useState([]);
  let [customers, setCustomers] = useState([]);
  let [accounts, setAccounts] = useState([]);
  let [loans, setLoans] = useState([]);
  let [transactions, setTransactions] = useState([]);
  let [auditLogs, setAuditLogs] = useState([]);
  let [loanPayments, setLoanPayments] = useState([]);
  let [toast, setToast] = useState("");
  let [loading, setLoading] = useState(true);

  let notify = (m) => {
    setToast(m);
    window.setTimeout(() => setToast(""), 3000);
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/data`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Backend could not load database data.");
        return r.json();
      })
      .then((data) => {
        setBranches(data.branches);
        setCustomers(data.customers);
        setAccounts(data.accounts);
        setLoans(data.loans);
        setTransactions(data.transactions);
        setAuditLogs(data.auditLogs);
        setLoanPayments(data.loanPayments || []);
        setLoading(false);
      })
      .catch((error) => {
        setLoading(false);
        notify("Cannot connect to MySQL backend. Start the backend and check database settings.");
        console.error(error);
      });
  }, []);

  let d = { branches, customers, accounts, loans, transactions, auditLogs, loanPayments };

  return (
    <>
      {loading && <div className="toast">Connecting to Nexora Bank database...</div>}
      <Routes>
        <Route element={<Layout user={user} />}>
          <Route index element={<Dashboard d={d} user={user} />} />
          <Route
            path="customers"
            element={
              <Entity
                title="Customer management"
                subtitle="CUSTOMER table with unique PAN, phone and email."
                kind="customers"
                d={d}
                setD={setCustomers}
                notify={notify}
              />
            }
          />
          <Route
            path="branches"
            element={
              <Entity
                title="Branch management"
                subtitle="BRANCH table and IFSC code."
                kind="branches"
                d={d}
                setD={setBranches}
                notify={notify}
              />
            }
          />
          <Route
            path="accounts"
            element={
              <Entity
                title="Bank accounts"
                subtitle="ACCOUNT table and customer/branch relationships."
                kind="accounts"
                d={d}
                setD={setAccounts}
                notify={notify}
              />
            }
          />
          <Route
            path="loans"
            element={
              <LoansManager
                d={d}
                user={user}
                setLoans={setLoans}
                setAccounts={setAccounts}
                setTransactions={setTransactions}
                setAuditLogs={setAuditLogs}
                setLoanPayments={setLoanPayments}
                notify={notify}
              />
            }
          />
          <Route path="transactions" element={<Transactions d={d} />} />
          <Route path="audit-log" element={<Audit d={d} />} />
          <Route path="reports" element={<Reports d={d} />} />
          <Route
            path="money-operations"
            element={
              <MoneyOps
                d={d}
                setAccounts={setAccounts}
                setTransactions={setTransactions}
                setAuditLogs={setAuditLogs}
                notify={notify}
              />
            }
          />
        </Route>
      </Routes>
      {toast && (
        <div className="toast">
          {toast}
          <button onClick={() => setToast("")}>×</button>
        </div>
      )}
    </>
  );
}

function AuthGate() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [fullName, setFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("employee");
  const [message, setMessage] = useState("");
  const api = API_BASE;

  async function loadUser() {
    try {
      const r = await fetch(api + "/api/auth/me", { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setUser(d.user);
      }
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(api + "/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Login failed.");
      setUser(d.user);
      setPassword("");
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch(api + "/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setShowUsers(false);
  }

  async function openEmployees() {
    setShowUsers((v) => !v);
    if (!showUsers) {
      const r = await fetch(api + "/api/admin/employees", { credentials: "include" });
      const d = await r.json();
      if (r.ok) setEmployees(d);
      else setMessage(d.error || "Could not load employees.");
    }
  }

  async function createEmployee(e) {
    e.preventDefault();
    setMessage("");
    try {
      const r = await fetch(api + "/api/admin/employees", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email: newEmail,
          password: newPassword,
          role: newRole,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMessage("Employee account created.");
      setFullName("");
      setNewEmail("");
      setNewPassword("");
      const list = await fetch(api + "/api/admin/employees", { credentials: "include" });
      setEmployees(await list.json());
    } catch (x) {
      setMessage(x.message);
    }
  }

  if (checking) return <div style={{ padding: 40, fontFamily: "Arial" }}>Checking employee session...</div>;

  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f3f5f8",
          fontFamily: "Arial",
          padding: 20,
        }}
      >
        <form
          onSubmit={login}
          style={{
            background: "white",
            padding: 32,
            borderRadius: 16,
            width: "min(420px,100%)",
            boxShadow: "0 12px 40px #17203318",
          }}
        >
          <div style={{ fontSize: 13, letterSpacing: 2, color: "#64748b", fontWeight: 700 }}>
            NEXORA BANK
          </div>
          <h1 style={{ margin: "10px 0" }}>Employee sign in</h1>
          <p style={{ color: "#64748b" }}>
            Only bank employees with an active account can access the banking system.
          </p>
          <label style={{ display: "block", marginTop: 18 }}>Work email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 12, marginTop: 6, boxSizing: "border-box" }}
          />
          <label style={{ display: "block", marginTop: 14 }}>Password</label>
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 12, marginTop: 6, boxSizing: "border-box" }}
          />
          {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
          <button
            disabled={busy}
            style={{
              width: "100%",
              padding: 13,
              marginTop: 20,
              background: "#173b63",
              color: "white",
              border: 0,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
          <small style={{ display: "block", marginTop: 16, color: "#64748b" }}>
            Public registration is disabled. Ask your bank administrator for an employee account.
          </small>
        </form>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          right: 20,
          top: 12,
          zIndex: 9999,
          display: "flex",
          gap: 8,
          alignItems: "center",
          background: "white",
          padding: 8,
          borderRadius: 8,
          boxShadow: "0 2px 12px #0002",
          fontFamily: "Arial",
          fontSize: 13,
        }}
      >
        <b>{user.name}</b>
        <span>({user.role})</span>
        {user.role === "admin" && <button onClick={openEmployees}>Employee accounts</button>}
        <button onClick={logout}>Log out</button>
      </div>
      {showUsers && user.role === "admin" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#0008",
            zIndex: 9998,
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 12,
              width: "min(650px,100%)",
              maxHeight: "85vh",
              overflow: "auto",
              fontFamily: "Arial",
            }}
          >
            <button style={{ float: "right" }} onClick={() => setShowUsers(false)}>
              Close
            </button>
            <h2>Employee accounts</h2>
            <form onSubmit={createEmployee} style={{ display: "grid", gap: 10 }}>
              <input
                required
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <input
                required
                type="email"
                placeholder="Work email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <input
                required
                minLength={10}
                type="password"
                placeholder="Temporary password (10+ characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </select>
              <button>Create employee account</button>
            </form>
            {message && <p>{message}</p>}
            <h3>Existing accounts</h3>
            {employees.map((x) => (
              <p key={x.user_id}>
                {x.full_name} — {x.email} — {x.role} — {x.is_active ? "Active" : "Inactive"}
              </p>
            ))}
          </div>
        </div>
      )}
      <BankApp user={user} />
    </>
  );
}

export default AuthGate;


