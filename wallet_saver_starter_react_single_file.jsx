/*
README - Wallet Saver (Starter)

What this is
- A single-file React component (default export) that implements a simple wallet/webapp for distributing spending and saving.
- Uses Tailwind CSS utility classes (assumes Tailwind is set up in the project) but will work with plain CSS after small tweaks.
- Persists data in localStorage so you can push this to a GitHub repo and the app works immediately.

Features included
- Create/Delete categories (e.g., Food, Transport, Savings)
- Allocate % or fixed amounts per category from a monthly income
- Add expenses and incomes (automatic balance adjust)
- Automatic distribution engine that suggests / recalculates allocations
- Simple "Save to Goal" transfers (move category money into a savings goal)
- Export / Import data (JSON)

How to use
1. Create a new React app (Vite / Create React App). Example:
   npx create-react-app wallet-saver
2. Install Tailwind following the official docs (optional). If you don't use Tailwind, replace classes with your CSS.
3. Replace App.jsx content with this file (or import this component into your project)
4. Run: npm start
5. To publish: push repo to GitHub and deploy on Vercel/Netlify/GitHub Pages.

Notes / Next steps
- Add authentication / server-side DB (Firebase or Supabase) for multi-device sync
- Add charts (recharts) for visualization
- Add unit tests and E2E tests
- Convert amounts to different currencies

---- Component code starts below ----
*/

import React, { useEffect, useMemo, useState } from "react";

// Utility helpers
const uid = (prefix = "id") => prefix + Math.random().toString(36).slice(2, 9);
const saveLS = (key, data) => localStorage.setItem(key, JSON.stringify(data));
const loadLS = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
};

export default function WalletSaver() {
  // Data model
  const [income, setIncome] = useState(() => loadLS("ws_income", 50000));
  const [categories, setCategories] = useState(() =>
    loadLS("ws_categories", [
      { id: uid("cat"), name: "Essentials", percent: 50, balance: 0 },
      { id: uid("cat"), name: "Savings", percent: 20, balance: 0 },
      { id: uid("cat"), name: "Wants", percent: 30, balance: 0 },
    ])
  );
  const [transactions, setTransactions] = useState(() => loadLS("ws_tx", []));
  const [goals, setGoals] = useState(() => loadLS("ws_goals", []));

  // Derived state: total percent
  const totalPercent = useMemo(
    () => categories.reduce((s, c) => s + (Number(c.percent) || 0), 0),
    [categories]
  );

  // When income or categories change, distribute funds
  useEffect(() => {
    distributeIncome();
    saveLS("ws_income", income);
  }, [income]);

  useEffect(() => {
    saveLS("ws_categories", categories);
  }, [categories]);

  useEffect(() => {
    saveLS("ws_tx", transactions);
  }, [transactions]);

  useEffect(() => {
    saveLS("ws_goals", goals);
  }, [goals]);

  function distributeIncome() {
    // If totalPercent is not 100, normalize percentages proportionally
    const tp = categories.reduce((s, c) => s + (Number(c.percent) || 0), 0);
    if (categories.length === 0) return;
    let newCats;
    if (tp === 0) {
      // if user hasn't allocated, split equally
      const equal = Math.floor(income / categories.length);
      newCats = categories.map((c) => ({ ...c, balance: equal }));
    } else {
      newCats = categories.map((c) => {
        const p = Number(c.percent) || 0;
        const allocated = Math.round((p / Math.max(tp, 1)) * income);
        return { ...c, balance: allocated };
      });
    }
    setCategories(newCats);
  }

  // Category CRUD
  function addCategory(name = "New") {
    const c = { id: uid("cat"), name, percent: 0, balance: 0 };
    setCategories((s) => [...s, c]);
  }

  function updateCategory(id, patch) {
    setCategories((s) => s.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCategory(id) {
    setCategories((s) => s.filter((c) => c.id !== id));
    // Move transactions? For simplicity we keep transactions but category name will be gone
  }

  // Transactions: income positive, expense negative
  function addTransaction({ title, amount, categoryId, type = "expense" }) {
    const amt = Number(amount) || 0;
    const signed = type === "expense" ? -Math.abs(amt) : Math.abs(amt);
    const tx = { id: uid("tx"), title, amount: signed, categoryId, date: new Date().toISOString() };
    setTransactions((s) => [tx, ...s]);
    // adjust category balance
    if (categoryId) {
      setCategories((s) =>
        s.map((c) => (c.id === categoryId ? { ...c, balance: Math.max(0, c.balance + signed) } : c))
      );
    }
  }

  // Simple transfer to goal (withdraw from category)
  function createGoal({ name, targetAmount, fromCategoryId }) {
    const g = { id: uid("g"), name, targetAmount: Number(targetAmount) || 0, saved: 0 };
    setGoals((s) => [...s, g]);
    // attempt to transfer available funds
    if (fromCategoryId) {
      const c = categories.find((cc) => cc.id === fromCategoryId);
      if (c && c.balance > 0) {
        const transfer = Math.min(c.balance, g.targetAmount);
        // deduct
        setCategories((s) => s.map((cc) => (cc.id === fromCategoryId ? { ...cc, balance: cc.balance - transfer } : cc)));
        setGoals((s) => s.map((gg) => (gg.id === g.id ? { ...gg, saved: gg.saved + transfer } : gg)));
      }
    }
  }

  // Export / Import
  function exportData() {
    const payload = { income, categories, transactions, goals };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wallet-saver-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        setIncome(parsed.income ?? income);
        setCategories(parsed.categories ?? categories);
        setTransactions(parsed.transactions ?? transactions);
        setGoals(parsed.goals ?? goals);
      } catch (err) {
        alert("Invalid file");
      }
    };
    reader.readAsText(file);
  }

  // Quick UI state
  const [newCatName, setNewCatName] = useState("");
  const [txForm, setTxForm] = useState({ title: "", amount: "", categoryId: categories[0]?.id || null, type: "expense" });

  useEffect(() => {
    // keep tx form category in sync when categories change
    setTxForm((s) => ({ ...s, categoryId: categories[0]?.id || null }));
  }, [categories.length]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-4xl mx-auto bg-white p-6 rounded-2xl shadow">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Wallet Saver — Starter</h1>
          <div className="text-sm text-gray-600">Local-only demo • Data in localStorage</div>
        </header>

        <section className="mb-6">
          <label className="block text-sm text-gray-700 mb-1">Monthly Income</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={income}
              onChange={(e) => setIncome(Number(e.target.value))}
              className="p-2 border rounded w-40"
            />
            <button
              onClick={distributeIncome}
              className="px-3 py-2 bg-indigo-600 text-white rounded hover:opacity-95"
            >
              Distribute
            </button>
            <div className="flex gap-2">
              <button onClick={exportData} className="px-3 py-2 border rounded">Export</button>
              <label className="px-3 py-2 border rounded cursor-pointer">
                Import
                <input type="file" onChange={importData} className="hidden" />
              </label>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-3">Categories ({categories.length})</h2>
            <div className="space-y-3">
              {categories.map((c) => (
                <div key={c.id} className="p-3 border rounded flex items-center justify-between">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-gray-500">{c.balance.toLocaleString()} • {c.percent}%</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={c.percent}
                      onChange={(e) => updateCategory(c.id, { percent: Number(e.target.value) })}
                      className="w-20 p-1 border rounded text-sm"
                      title="Percent allocation"
                    />
                    <button onClick={() => removeCategory(c.id)} className="px-2 py-1 border rounded text-sm">Remove</button>
                  </div>
                </div>
              ))}

              <div className="flex gap-2">
                <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name" className="flex-1 p-2 border rounded" />
                <button
                  onClick={() => { if (newCatName.trim()) { addCategory(newCatName.trim()); setNewCatName(""); } }}
                  className="px-3 py-2 bg-green-600 text-white rounded"
                >Add</button>
              </div>

              <div className="text-xs text-gray-500">Total allocation: {totalPercent}%</div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Quick Transaction</h2>
            <div className="space-y-2 p-3 border rounded">
              <input value={txForm.title} onChange={(e)=>setTxForm(s=>({...s,title:e.target.value}))} className="w-full p-2 border rounded" placeholder="Title (e.g., Lunch)" />
              <div className="flex gap-2">
                <input value={txForm.amount} onChange={(e)=>setTxForm(s=>({...s,amount:e.target.value}))} type="number" placeholder="Amount" className="p-2 border rounded w-32" />
                <select value={txForm.categoryId || ""} onChange={(e)=>setTxForm(s=>({...s,categoryId:e.target.value}))} className="p-2 border rounded flex-1">
                  {categories.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={txForm.type} onChange={(e)=>setTxForm(s=>({...s,type:e.target.value}))} className="p-2 border rounded w-28">
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
                <button onClick={()=>{ addTransaction(txForm); setTxForm({ title: "", amount: "", categoryId: categories[0]?.id || null, type: "expense" }); }} className="px-3 py-2 bg-indigo-600 text-white rounded">Add</button>
              </div>
            </div>

            <h3 className="mt-4 font-medium">Transactions</h3>
            <div className="max-h-48 overflow-auto mt-2 space-y-2">
              {transactions.length===0 ? <div className="text-sm text-gray-500">No transactions yet</div> : transactions.map(tx=> (
                <div key={tx.id} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <div className="font-medium">{tx.title}</div>
                    <div className="text-xs text-gray-500">{new Date(tx.date).toLocaleString()} • {tx.amount.toLocaleString()}</div>
                  </div>
                  <div className="text-sm">{categories.find(c=>c.id===tx.categoryId)?.name || "-"}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-3">Savings Goals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 border rounded">
              <GoalCreator categories={categories} onCreate={createGoal} />
            </div>

            <div className="p-3 border rounded">
              {goals.length===0 ? <div className="text-sm text-gray-500">No goals yet</div> : goals.map(g=> (
                <div key={g.id} className="mb-3">
                  <div className="flex justify-between items-center">
                    <div className="font-medium">{g.name}</div>
                    <div className="text-sm">{g.saved.toLocaleString()} / {g.targetAmount.toLocaleString()}</div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded mt-2">
                    <div style={{ width: Math.min(100, (g.saved / Math.max(1,g.targetAmount)) * 100) + "%" }} className="h-2 bg-indigo-600 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="mt-6 text-sm text-gray-500">Tip: Click Distribute whenever you update income or percentages to reallocate funds.
        </footer>
      </div>
    </div>
  );
}

function GoalCreator({ categories = [], onCreate }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState(0);
  const [from, setFrom] = useState(categories[0]?.id || "");

  useEffect(()=>{ setFrom(categories[0]?.id || ""); }, [categories.length]);

  return (
    <div>
      <div className="text-sm text-gray-700 mb-2">Create a new savings goal</div>
      <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Goal name" className="w-full p-2 border rounded mb-2" />
      <input type="number" value={target} onChange={(e)=>setTarget(Number(e.target.value))} placeholder="Target amount" className="w-full p-2 border rounded mb-2" />
      <select value={from} onChange={(e)=>setFrom(e.target.value)} className="w-full p-2 border rounded mb-2">
        <option value="">(no transfer)</option>
        {categories.map(c=> <option key={c.id} value={c.id}>{c.name} — {c.balance.toLocaleString()}</option>)}
      </select>
      <div className="flex gap-2">
        <button onClick={()=>{ if(name.trim()){ onCreate({name: name.trim(), targetAmount: target, fromCategoryId: from}); setName(""); setTarget(0); } }} className="px-3 py-2 bg-green-600 text-white rounded">Create Goal</button>
      </div>
    </div>
  );
}
