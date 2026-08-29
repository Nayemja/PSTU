"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Search, ShieldCheck, Sparkles, UserRound, WalletCards } from "lucide-react";

const API = "http://localhost:5000";
const inputClass = "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const primaryButton = "h-11 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "h-11 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50";
const cardClass = "rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm";

type Recipient = { id: string; name: string; email: string };
type Person = Recipient;
type Transaction = { id: string; type: "SENT" | "RECEIVED"; person: Person; amountPoysha: number; note: string | null; status: string; createdAt: string };
type MoneyRequest = { id: string; person: Person; amountPoysha: number; note: string | null; status: string };
type PaymentDraft = { recipientName: string; recipientEmail: string; amountTaka: number; note: string };
type Risk = { riskLevel: "LOW" | "MEDIUM" | "HIGH"; requiresReview: boolean; reasons: string[] };

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, { ...options, credentials: "include", headers: { "content-type": "application/json", ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "Request failed");
  return body;
}

const formatTaka = (poysha: number) => `৳${(poysha / 100).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

export default function Home() {
  const [user, setUser] = useState<Person | null>(null);
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [incoming, setIncoming] = useState<MoneyRequest[]>([]);
  const [outgoing, setOutgoing] = useState<MoneyRequest[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [manualError, setManualError] = useState("");
  const [intentError, setIntentError] = useState("");
  const [stressError, setStressError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [isParsingIntent, setIsParsingIntent] = useState(false);
  const [isSearchingRecipient, setIsSearchingRecipient] = useState(false);
  const [isReviewingPayment, setIsReviewingPayment] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [registration, setRegistration] = useState({ name: "", email: "", password: "", otp: "" });

  const [payMode, setPayMode] = useState<"intent" | "stress">("intent");
  const [manual, setManual] = useState({ recipientEmail: "", amountTaka: "", note: "" });
  const [intent, setIntent] = useState("");
  const [quickDraft, setQuickDraft] = useState<PaymentDraft | null>(null);
  const [intentMatches, setIntentMatches] = useState<Person[]>([]);
  const [intentMessage, setIntentMessage] = useState("");

  const [recipientSearch, setRecipientSearch] = useState("");
  const [contactMatches, setContactMatches] = useState<Person[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [stressAmount, setStressAmount] = useState(500);
  const [otherAmount, setOtherAmount] = useState(false);

  const [review, setReview] = useState<{ draft: PaymentDraft; risk: Risk; phase: "security" | "confirm" } | null>(null);
  const [scheduled, setScheduled] = useState<{ draft: PaymentDraft; idempotencyKey: string; seconds: number } | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<{ draft: PaymentDraft; newBalancePoysha: number } | null>(null);
  const sendingRef = useRef(false);
  const initialLoadRef = useRef(false);
  const [moneyRequest, setMoneyRequest] = useState({ payerEmail: "", amountTaka: "", note: "" });

  const refreshUser = useCallback(async () => {
    const me = await api("/auth/me"); setUser(me.user); setBalance(me.balancePoysha);
  }, []);
  const refreshHistory = useCallback(async () => {
    const transactions = await api("/transactions/history"); setHistory(transactions.transactions);
  }, []);
  const refreshMoneyRequests = useCallback(async () => {
    const requests = await api("/money-requests"); setIncoming(requests.incoming); setOutgoing(requests.outgoing);
  }, []);
  const loadDashboard = useCallback(async () => {
    try { await Promise.all([refreshUser(), refreshHistory(), refreshMoneyRequests()]); }
    catch { setUser(null); }
  }, [refreshUser, refreshHistory, refreshMoneyRequests]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!scheduled) return;
    if (scheduled.seconds > 0) {
      const timer = window.setTimeout(() => setScheduled((current) => current ? { ...current, seconds: current.seconds - 1 } : null), 1000);
      return () => window.clearTimeout(timer);
    }
    if (sendingRef.current) return;
    sendingRef.current = true;
    void api("/transfers", {
      method: "POST",
      body: JSON.stringify({ recipientEmail: scheduled.draft.recipientEmail, amountPoysha: Math.round(scheduled.draft.amountTaka * 100), note: scheduled.draft.note || undefined, idempotencyKey: scheduled.idempotencyKey }),
    }).then(async (result) => {
      setBalance(result.senderBalancePoysha);
      setPaymentSuccess({ draft: scheduled.draft, newBalancePoysha: result.senderBalancePoysha });
      setNotice(""); setScheduled(null); await Promise.all([refreshUser(), refreshHistory()]);
    }).catch((caught) => { setError((caught as Error).message); setScheduled(null); })
      .finally(() => { sendingRef.current = false; });
  }, [scheduled, refreshUser, refreshHistory]);

  const recentContacts = useMemo(() => {
    const unique = new Map<string, Person>();
    history.forEach((item) => { if (!unique.has(item.person.id)) unique.set(item.person.id, item.person); });
    return [...unique.values()].slice(0, 5);
  }, [history]);

  function clearFeedback() { setNotice(""); setError(""); }

  async function submitLogin(event: FormEvent) {
    event.preventDefault(); clearFeedback();
    try { await api("/auth/login", { method: "POST", body: JSON.stringify(login) }); await loadDashboard(); }
    catch (caught) { setError((caught as Error).message); }
  }

  async function requestOtp(event?: FormEvent) {
    event?.preventDefault(); clearFeedback();
    try {
      const result = await api("/auth/register/request-otp", { method: "POST", body: JSON.stringify({ name: registration.name, email: registration.email, password: registration.password }) });
      setNotice(result.message); setRegisterStep(2);
    } catch (caught) { setError((caught as Error).message); }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault(); clearFeedback();
    try {
      await api("/auth/register/verify-otp", { method: "POST", body: JSON.stringify({ email: registration.email, otp: registration.otp }) });
      await loadDashboard();
    } catch (caught) { setError((caught as Error).message); }
  }

  async function searchPeople(query: string): Promise<Person[]> {
    if (!query.trim()) return [];
    const result = await api(`/users/search?q=${encodeURIComponent(query.trim())}`);
    return result.users;
  }

  async function understandIntent() {
    clearFeedback(); setIntentError(""); setIntentMessage(""); setIntentMatches([]); setQuickDraft(null); setSelectedRecipient(null); setIsParsingIntent(true);
    try {
      const response = await fetch("/ai/parse-payment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: intent }) });
      const parsed = await response.json();
      if (!response.ok) throw new Error(parsed.message);
      const name = parsed.draft.recipientName ?? "";
      const draft: PaymentDraft = { recipientName: name, recipientEmail: "", amountTaka: parsed.draft.amountTaka ?? 0, note: parsed.draft.note ?? "" };
      setQuickDraft(draft);
      if (!name) { setIntentMessage("Add a recipient name or email to complete this draft."); return; }
      const matches = await searchPeople(name);
      if (matches.length === 1) {
        setSelectedRecipient(matches[0]);
        setQuickDraft({ ...draft, recipientName: matches[0].name, recipientEmail: matches[0].email });
        setIntentMessage("Payment draft ready.");
      } else if (matches.length > 1) {
        setIntentMatches(matches); setIntentMessage(`${matches.length} accounts matched '${name}'. Choose the recipient.`);
      } else {
        setIntentMessage(`We couldn't find '${name}'. Search by name or email.`);
      }
    } catch (caught) { setIntentError((caught as Error).message); }
    finally { setIsParsingIntent(false); }
  }

  async function reviewPayment(draft: PaymentDraft, source: "manual" | "intent" | "stress") {
    clearFeedback();
    const setLocalError = source === "manual" ? setManualError : source === "intent" ? setIntentError : setStressError;
    setLocalError("");
    if (scheduled) { setLocalError("One payment is waiting for confirmation."); return; }
    if (!draft.recipientEmail || draft.amountTaka <= 0) { setLocalError("Choose a TrustPay recipient and enter a valid amount."); return; }
    setIsReviewingPayment(true);
    try {
      const risk = await api("/risk/transfer-preview", { method: "POST", body: JSON.stringify({ recipientEmail: draft.recipientEmail, amountPoysha: Math.round(draft.amountTaka * 100) }) });
      setReview({ draft, risk, phase: "security" });
    } catch (caught) {
      const message = (caught as Error).message;
      setLocalError(message === "Recipient not found" ? "TrustPay account not found." : message);
    } finally { setIsReviewingPayment(false); }
  }

  function confirmPayment() {
    if (!review) return;
    setScheduled({ draft: review.draft, idempotencyKey: crypto.randomUUID(), seconds: 10 });
    setReview(null);
  }

  function undoPayment() {
    setScheduled(null); sendingRef.current = false;
    setNotice("Payment cancelled — no money was moved.");
  }

  async function findContacts(event: FormEvent) {
    event.preventDefault(); clearFeedback(); setStressError(""); setSelectedRecipient(null); setIsSearchingRecipient(true);
    try {
      const matches = await searchPeople(recipientSearch); setContactMatches(matches);
      if (matches.length === 1) { setSelectedRecipient(matches[0]); setStressError(""); }
      else if (matches.length === 0) setStressError("TrustPay account not found.");
    } catch (caught) { setStressError((caught as Error).message); }
    finally { setIsSearchingRecipient(false); }
  }

  async function submitRequest(event: FormEvent) {
    event.preventDefault(); clearFeedback(); setRequestError(""); setIsSendingRequest(true);
    try {
      await api("/money-requests", { method: "POST", body: JSON.stringify({ payerEmail: moneyRequest.payerEmail, amountPoysha: Math.round(Number(moneyRequest.amountTaka) * 100), note: moneyRequest.note || undefined }) });
      setNotice("Money request created"); setMoneyRequest({ payerEmail: "", amountTaka: "", note: "" }); await refreshMoneyRequests();
    } catch (caught) { setRequestError((caught as Error).message); }
    finally { setIsSendingRequest(false); }
  }

  async function updateRequest(id: string, action: "approve" | "decline") {
    clearFeedback();
    try {
      const result = await api(`/money-requests/${id}/${action}`, { method: "POST" }); setNotice(result.message);
      if (action === "approve") await Promise.all([refreshUser(), refreshHistory(), refreshMoneyRequests()]);
      else await refreshMoneyRequests();
    }
    catch (caught) { setRequestError((caught as Error).message); }
  }

  if (!user) return <AuthCard authMode={authMode} setAuthMode={setAuthMode} registerStep={registerStep} setRegisterStep={setRegisterStep} login={login} setLogin={setLogin} registration={registration} setRegistration={setRegistration} submitLogin={submitLogin} requestOtp={requestOtp} verifyOtp={verifyOtp} notice={notice} error={error}/>;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f0fdf4_0,#f8fafc_260px)] text-zinc-900">
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInFromLeft {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-slideDown { animation: slideDown 0.5s ease-out; }
        .animate-slideUp { animation: slideUp 0.6s ease-out; }
        .animate-slideInFromLeft { animation: slideInFromLeft 0.5s ease-out; }
        .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.3s ease-out; }
        .btn-hover { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .btn-hover:hover { transform: translateY(-2px); }
        .btn-hover:active { transform: translateY(0px); }
      `}</style>
      <header className="animate-slideDown border-b border-emerald-900/10 bg-white/90 backdrop-blur"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-emerald-700 text-white"><WalletCards size={19}/></div><h1 className="text-lg font-bold tracking-tight text-emerald-950">TrustPay</h1></div><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">{user.name.charAt(0).toUpperCase()}</div><div className="hidden leading-tight sm:block"><p className="text-sm font-semibold">{user.name}</p><p className="max-w-52 truncate text-xs text-zinc-500">{user.email}</p></div><button className="btn-hover h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50" onClick={async () => { await api("/auth/logout", { method: "POST" }); setUser(null); }}>Log out</button></div></div></header>

      <div className="mx-auto max-w-7xl space-y-5 px-5 py-6">
        <section className="animate-slideUp rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-950 p-6 text-white shadow-xl shadow-emerald-950/15"><div><p className="text-sm font-medium text-emerald-100">Available Balance</p><p className="mt-1 text-4xl font-bold tracking-tight">{formatTaka(balance)}</p><p className="mt-2 text-sm text-emerald-200">Your TrustPay wallet</p></div><div className="mt-6 grid grid-cols-3 gap-2"><button className="btn-hover rounded-2xl bg-white/10 p-3 text-center text-xs font-semibold transition hover:bg-white/20" onClick={() => document.getElementById("send-money")?.scrollIntoView({ behavior: "smooth" })}><ArrowUpRight className="mx-auto mb-1" size={20}/>Send Money</button><button className="btn-hover rounded-2xl bg-white/10 p-3 text-center text-xs font-semibold transition hover:bg-white/20" onClick={() => document.getElementById("request-money")?.scrollIntoView({ behavior: "smooth" })}><ArrowDownLeft className="mx-auto mb-1" size={20}/>Request Money</button><button className="btn-hover rounded-2xl bg-white p-3 text-center text-xs font-semibold text-emerald-900 transition hover:bg-emerald-50" onClick={() => { setPayMode("intent"); document.getElementById("quick-pay")?.scrollIntoView({ behavior: "smooth" }); }}><Sparkles className="mx-auto mb-1" size={20}/>Smart Quick Pay</button></div></section>

        {(notice || error) && <div className={`animate-slideUp rounded-xl border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error || notice}</div>}

        {scheduled && <section className="animate-slideUp fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-2xl"><div><p className="font-semibold text-amber-950">Sending {formatTaka(scheduled.draft.amountTaka * 100)} to {scheduled.draft.recipientName} in {scheduled.seconds} seconds</p><p className="text-sm text-amber-800">You can cancel before the countdown ends.</p></div><button className="btn-hover h-11 shrink-0 rounded-xl bg-red-600 px-5 text-sm font-bold text-white" onClick={undoPayment}>UNDO</button></section>}

        <section id="quick-pay" className="smart-pay-card rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-emerald-950">Smart Quick Pay</h2><span className="gemini-badge rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Powered by Gemini</span></div><p className="mt-1 text-sm text-zinc-500">Choose the easiest way to pay.</p></div><div className="grid shrink-0 grid-cols-2 rounded-xl bg-zinc-100 p-1"><button className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-300 ${payMode === "intent" ? "bg-white text-emerald-800 shadow-sm" : "text-zinc-500"}`} onClick={() => setPayMode("intent")}><Sparkles className="mr-2 inline" size={15}/>Natural Input</button><button className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-300 ${payMode === "stress" ? "bg-white text-emerald-800 shadow-sm" : "text-zinc-500"}`} onClick={() => setPayMode("stress")}><ShieldCheck className="mr-2 inline" size={15}/>Stress-Free Pay</button></div></div><div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500"><span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">Natural: “ovi ke 300 pathao”</span><span className="font-semibold text-zinc-300">OR</span><span className="rounded-full bg-zinc-100 px-3 py-1">Select contact + quick amount / slider</span></div>
          {payMode === "intent" ? <QuickIntent intent={intent} setIntent={setIntent} understand={understandIntent} draft={quickDraft} setDraft={setQuickDraft} matches={intentMatches} setMatches={setIntentMatches} selectedRecipient={selectedRecipient} setSelectedRecipient={setSelectedRecipient} message={intentMessage} error={intentError} isParsing={isParsingIntent} isReviewing={isReviewingPayment} paymentPending={Boolean(scheduled)} reviewPayment={reviewPayment}/> : <StressFree recentContacts={recentContacts} search={recipientSearch} setSearch={(value) => { setRecipientSearch(value); setSelectedRecipient(null); setStressError(""); }} findContacts={findContacts} matches={contactMatches} recipient={selectedRecipient} setRecipient={(person) => { setSelectedRecipient(person); setStressError(""); }} amount={stressAmount} setAmount={setStressAmount} otherAmount={otherAmount} setOtherAmount={setOtherAmount} error={stressError} isSearching={isSearchingRecipient} isReviewing={isReviewingPayment} paymentPending={Boolean(scheduled)} reviewPayment={reviewPayment}/>} 
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
        <section id="send-money" className={`${cardClass} animate-slideUp`}><SectionTitle title="Send Money" subtitle="Pay a TrustPay account by email"/><form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void reviewPayment({ recipientName: manual.recipientEmail, recipientEmail: manual.recipientEmail, amountTaka: Number(manual.amountTaka), note: manual.note }, "manual"); }}><Field label="Recipient"><input className={inputClass} type="email" required placeholder="recipient@example.com" value={manual.recipientEmail} onChange={(event) => { setManual({ ...manual, recipientEmail: event.target.value }); setManualError(""); }}/>{manualError && <p className="mt-1.5 text-sm text-red-600">{manualError}</p>}</Field><Field label="Amount (Taka)"><input className={inputClass} type="number" min="0.01" step="0.01" required placeholder="500" value={manual.amountTaka} onChange={(event) => setManual({ ...manual, amountTaka: event.target.value })}/></Field><Field label="Note (optional)"><input className={inputClass} maxLength={200} placeholder="Lunch" value={manual.note} onChange={(event) => setManual({ ...manual, note: event.target.value })}/></Field><button className={`${primaryButton} btn-hover w-full`} disabled={isReviewingPayment || Boolean(scheduled)}>{isReviewingPayment ? "Checking..." : "Review Payment"}</button></form></section>
          <section id="request-money" className={`${cardClass} animate-slideUp`} style={{ animationDelay: "0.1s" }}><SectionTitle title="Request Money" subtitle="Ask another TrustPay user to pay you"/><form className="mt-4 space-y-3" onSubmit={submitRequest}><Field label="Payer"><input className={inputClass} type="email" required placeholder="payer@example.com" value={moneyRequest.payerEmail} onChange={(event) => { setMoneyRequest({ ...moneyRequest, payerEmail: event.target.value }); setRequestError(""); }}/>{requestError && <p className="mt-1.5 text-sm text-red-600">{requestError}</p>}</Field><Field label="Amount (Taka)"><input className={inputClass} type="number" min="0.01" step="0.01" required placeholder="500" value={moneyRequest.amountTaka} onChange={(event) => setMoneyRequest({ ...moneyRequest, amountTaka: event.target.value })}/></Field><Field label="Note (optional)"><input className={inputClass} maxLength={200} placeholder="Lunch" value={moneyRequest.note} onChange={(event) => setMoneyRequest({ ...moneyRequest, note: event.target.value })}/></Field><button className={`${primaryButton} btn-hover w-full`} disabled={isSendingRequest}>{isSendingRequest ? "Sending request..." : "Send Request"}</button></form></section>
        </div>

        <section className={`${cardClass} animate-slideUp`} style={{ animationDelay: "0.2s" }}><SectionTitle title="Money Requests" subtitle="Incoming and outgoing payment requests"/><div className="mt-4 grid gap-5 lg:grid-cols-2"><RequestList title="Incoming" items={incoming} incoming actions={updateRequest}/><RequestList title="Outgoing" items={outgoing}/></div></section>
        <section className={`${cardClass} animate-slideUp`} style={{ animationDelay: "0.3s" }}><SectionTitle title="Recent Transactions" subtitle="Your latest sent and received payments"/><div className="mt-3 divide-y divide-zinc-100">{history.slice(0, 10).map((item, index) => <div key={item.id} className="animate-fadeIn flex items-center gap-3 py-4" style={{ animationDelay: `${index * 0.05}s` }}><div className={`grid size-10 shrink-0 place-items-center rounded-full ${item.type === "SENT" ? "bg-zinc-100 text-zinc-600" : "bg-emerald-100 text-emerald-700"}`}>{item.type === "SENT" ? <ArrowUpRight size={18}/> : <ArrowDownLeft size={18}/>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.type === "SENT" ? "Sent to" : "Received from"} {item.person.name}</p><p className="truncate text-xs text-zinc-500">{item.note || item.person.email} · {new Date(item.createdAt).toLocaleString()}</p></div><div className="text-right"><p className={`text-sm font-bold ${item.type === "RECEIVED" ? "text-emerald-700" : ""}`}>{item.type === "RECEIVED" ? "+" : "−"}{formatTaka(item.amountPoysha)}</p><p className="text-xs font-medium text-zinc-500">{item.status}</p></div></div>)}{history.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">No transactions yet</p>}</div></section>
      </div>

      {review && <div className="animate-fadeIn fixed inset-0 z-30 grid place-items-center bg-zinc-950/40 p-4 backdrop-blur-sm"><div className="animate-scaleIn w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{review.phase === "security" ? "Trust Check" : "Payment Draft"}</p><h2 className="mt-1 text-xl font-bold">{review.phase === "security" ? review.risk.riskLevel : `Send ${formatTaka(review.draft.amountTaka * 100)} to ${review.draft.recipientName}?`}</h2>{review.phase === "security" && <p className="mt-2 text-sm text-zinc-500">TrustPay checks transaction context before money moves. Gemini does not make security decisions.</p>}<div className="my-5 rounded-2xl bg-zinc-50 p-4"><p className="font-semibold">{review.draft.recipientName}</p><p className="text-sm text-zinc-500">{review.draft.recipientEmail}</p><p className="mt-4 text-3xl font-bold">{formatTaka(review.draft.amountTaka * 100)}</p>{review.draft.note && <p className="mt-1 text-sm text-zinc-500">Note: {review.draft.note}</p>}</div>{review.phase === "security" && review.risk.reasons.length > 0 && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Why this needs attention</p>{review.risk.reasons.map((reason) => <p className="mt-1" key={reason}>• {reason}</p>)}</div>}<div className="grid grid-cols-2 gap-3"><button className={`${secondaryButton} btn-hover`} onClick={() => setReview(null)}>Cancel</button>{review.phase === "security" ? <button className={`${primaryButton} btn-hover`} onClick={() => setReview({ ...review, phase: "confirm" })}>{review.risk.requiresReview ? "Continue Anyway" : "Continue"}</button> : <button className={`${primaryButton} btn-hover`} onClick={confirmPayment}>Confirm Payment</button>}</div></div></div>}
      {paymentSuccess && <div className="animate-fadeIn fixed inset-0 z-50 grid place-items-center bg-zinc-950/40 p-4 backdrop-blur-sm"><div className="animate-scaleIn w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl"><div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700 animate-slideDown">✓</div><h2 className="mt-4 text-xl font-bold">Payment Successful</h2><p className="mt-2 text-3xl font-bold text-emerald-800">{formatTaka(paymentSuccess.draft.amountTaka * 100)}</p><p className="mt-3 text-sm text-zinc-500">Sent to</p><p className="font-semibold">{paymentSuccess.draft.recipientName}</p><div className="my-5 rounded-2xl bg-zinc-50 p-4 text-sm"><span className="text-zinc-500">New balance</span><strong className="ml-2 text-emerald-800">{formatTaka(paymentSuccess.newBalancePoysha)}</strong></div><button className={`${primaryButton} btn-hover w-full`} onClick={() => setPaymentSuccess(null)}>Done</button></div></div>}
    </main>
  );
}

function QuickIntent({ intent, setIntent, understand, draft, setDraft, matches, setMatches, selectedRecipient, setSelectedRecipient, message, error, isParsing, isReviewing, paymentPending, reviewPayment }: { intent: string; setIntent: (value: string) => void; understand: () => void; draft: PaymentDraft | null; setDraft: (draft: PaymentDraft) => void; matches: Recipient[]; setMatches: (matches: Recipient[]) => void; selectedRecipient: Recipient | null; setSelectedRecipient: (recipient: Recipient | null) => void; message: string; error: string; isParsing: boolean; isReviewing: boolean; paymentPending: boolean; reviewPayment: (draft: PaymentDraft, source: "intent") => Promise<void> }) {
  return <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.9fr]"><div><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold">Natural Payment</h3><p className="mt-1 text-sm text-zinc-500">Write the way you normally speak.</p></div><span className="shrink-0 text-xs font-semibold text-emerald-700">Powered by Gemini</span></div><Field label="Payment instruction"><div className="flex flex-col gap-2 sm:flex-row"><input className={inputClass} placeholder="Rahim ke 500 taka pathao" value={intent} onChange={(event) => { setIntent(event.target.value); setSelectedRecipient(null); }}/><button className={`${primaryButton} shrink-0`} disabled={!intent.trim() || isParsing} onClick={understand}>{isParsing ? "Understanding your payment..." : "Understand Payment"}</button></div></Field><div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500"><span>Examples:</span><span className="rounded-full bg-zinc-100 px-2 py-1">Rahim 500</span><span className="rounded-full bg-zinc-100 px-2 py-1">Ma ke 2k pathao</span><span className="rounded-full bg-zinc-100 px-2 py-1">রহিমকে ৫০০ টাকা পাঠাও</span></div>{error && <p className="mt-3 text-sm text-red-600">{error}</p>}<p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">Gemini understands the language and prepares a draft. TrustPay resolves the account and performs every security check.</p></div><div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4"><p className="text-sm font-bold text-emerald-900">Payment Draft</p>{!draft ? <p className="mt-3 text-sm text-zinc-500">Your recipient, amount and note will appear here.</p> : <div className="mt-3 space-y-3">{message && <p className="rounded-lg bg-white p-2 text-sm text-zinc-600">{message}</p>}{matches.length > 1 && <div className="space-y-2"><p className="text-xs font-semibold uppercase text-zinc-500">Choose recipient</p>{matches.map((person) => <button key={person.id} className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left hover:border-emerald-500" onClick={() => { setSelectedRecipient(person); setDraft({ ...draft, recipientName: person.name, recipientEmail: person.email }); setMatches([]); }}><Avatar person={person}/><span><b className="block text-sm">{person.name}</b><small className="text-zinc-500">{person.email}</small></span></button>)}</div>}<div className="rounded-xl bg-white p-3"><p className="text-xs font-semibold uppercase text-zinc-400">Recipient</p><p className="mt-1 font-semibold">{selectedRecipient?.name || draft.recipientName || "Missing"}</p><p className="text-xs text-zinc-500">{selectedRecipient?.email || "Registered account match required"}</p>{selectedRecipient && <p className="mt-2 text-xs font-semibold text-emerald-700">✓ Registered account matched</p>}</div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-white p-3"><p className="text-xs font-semibold uppercase text-zinc-400">Amount</p><p className="mt-1 text-xl font-bold">{draft.amountTaka ? formatTaka(draft.amountTaka * 100) : "Missing"}</p></div><div className="rounded-xl bg-white p-3"><p className="text-xs font-semibold uppercase text-zinc-400">Note</p><p className="mt-1 truncate text-sm font-semibold">{draft.note || "None"}</p></div></div><button className={`${primaryButton} w-full`} disabled={!selectedRecipient || !draft.amountTaka || isReviewing || paymentPending} onClick={() => selectedRecipient && void reviewPayment({ ...draft, recipientName: selectedRecipient.name, recipientEmail: selectedRecipient.email }, "intent")}>{isReviewing ? "Checking..." : "Continue to Security Check"}</button></div>}</div></div>;
}

function StressFree({ recentContacts, search, setSearch, findContacts, matches, recipient, setRecipient, amount, setAmount, otherAmount, setOtherAmount, error, isSearching, isReviewing, paymentPending, reviewPayment }: { recentContacts: Person[]; search: string; setSearch: (value: string) => void; findContacts: (event: FormEvent) => Promise<void>; matches: Person[]; recipient: Person | null; setRecipient: (person: Person) => void; amount: number; setAmount: (amount: number) => void; otherAmount: boolean; setOtherAmount: (value: boolean) => void; error: string; isSearching: boolean; isReviewing: boolean; paymentPending: boolean; reviewPayment: (draft: PaymentDraft, source: "stress") => Promise<void> }) {
  const contacts = matches.length ? matches : recentContacts;
  return <div className="mt-5 grid gap-6 lg:grid-cols-2"><div><p className="text-sm font-semibold">1. Choose recipient</p><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recent Contacts</p><p className="mt-1 text-xs text-zinc-500">Verified emails from your transaction history.</p><div className="mt-3 flex gap-3 overflow-x-auto pb-2">{contacts.map((person) => <button key={person.id} className={`min-w-24 rounded-2xl border p-3 text-center transition ${recipient?.id === person.id ? "border-emerald-600 bg-emerald-50" : "bg-white hover:border-emerald-300"}`} onClick={() => setRecipient(person)}><Avatar person={person}/><span className="mt-2 block truncate text-xs font-semibold">{person.name}</span></button>)}{contacts.length === 0 && <p className="py-3 text-sm text-zinc-500">No recent contacts yet.</p>}</div><form className="mt-3 flex gap-2" onSubmit={findContacts}><div className="relative flex-1"><Search className="absolute left-3 top-3 text-zinc-400" size={17}/><input className={`${inputClass} pl-9`} placeholder="Recipient email or name" value={search} onChange={(event) => setSearch(event.target.value)}/></div><button className={secondaryButton} disabled={!search.trim() || isSearching}>{isSearching ? "Finding..." : "Find"}</button></form>{error && <p className="mt-2 text-sm text-red-600">{error}</p>}{recipient ? <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><span><b>✓ Recipient selected</b><br/>{recipient.name}<br/><span className="text-xs">{recipient.email}</span></span><button className="text-xs font-semibold text-emerald-800" onClick={() => setSearch("")}>Change</button></div> : <p className="mt-3 text-sm text-zinc-500">Choose a TrustPay recipient first.</p>}</div><div><p className="text-sm font-semibold">2. Quick Amount</p><div className="mt-3 grid grid-cols-4 gap-2">{[500, 1000, 2000, 5000].map((quick) => <button key={quick} className={`rounded-xl border py-2 text-sm font-semibold ${amount === quick && !otherAmount ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "bg-white"}`} onClick={() => { setAmount(quick); setOtherAmount(false); }}>৳{quick.toLocaleString()}</button>)}</div>{otherAmount ? <Field label="Other Amount"><input className={`${inputClass} mt-3`} type="number" min="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))}/></Field> : <div className="mt-5"><div className="flex justify-between text-xs text-zinc-500"><span>৳100</span><b className="text-xl text-emerald-800">৳{amount.toLocaleString()}</b><span>৳10,000</span></div><input className="mt-3 w-full accent-emerald-700" type="range" min="100" max="10000" step="100" value={amount} onChange={(event) => setAmount(Number(event.target.value))}/></div>}<button className="mt-2 text-sm font-semibold text-emerald-700" onClick={() => setOtherAmount(!otherAmount)}>{otherAmount ? "Use slider" : "Other Amount"}</button><p className="mt-5 text-sm font-semibold">3. Security Check</p><button className={`${primaryButton} mt-2 w-full`} disabled={!recipient || amount <= 0 || paymentPending || isReviewing} onClick={() => recipient && void reviewPayment({ recipientName: recipient.name, recipientEmail: recipient.email, amountTaka: amount, note: "" }, "stress")}>{isReviewing ? "Checking..." : "Continue to Security Check"}</button></div></div>;
}

function AuthCard({ authMode, setAuthMode, registerStep, setRegisterStep, login, setLogin, registration, setRegistration, submitLogin, requestOtp, verifyOtp, notice, error }: any) {
  return <main className="grid min-h-screen place-items-center bg-[linear-gradient(145deg,#ecfdf5,#f8fafc)] p-6"><div className="animate-scaleIn w-full max-w-sm rounded-3xl border border-emerald-900/10 bg-white p-8 shadow-xl shadow-emerald-950/5"><style>{`
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    .animate-slideDown { animation: slideDown 0.5s ease-out; }
    .animate-slideUp { animation: slideUp 0.6s ease-out; }
    .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
    .animate-scaleIn { animation: scaleIn 0.3s ease-out; }
    .btn-hover { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
    .btn-hover:hover { transform: translateY(-2px); }
    .btn-hover:active { transform: translateY(0px); }
  `}</style><div className="animate-slideDown flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-emerald-700 text-white"><WalletCards/></div><div><h1 className="text-2xl font-bold text-emerald-950">TrustPay</h1><p className="text-xs text-zinc-500">Secure simulated payments</p></div></div><div className="my-6 grid grid-cols-2 rounded-xl bg-zinc-100 p-1"><button className={`rounded-lg py-2 text-sm btn-hover ${authMode === "login" ? "bg-white font-semibold shadow-sm" : ""}`} onClick={() => setAuthMode("login")}>Login</button><button className={`rounded-lg py-2 text-sm btn-hover ${authMode === "register" ? "bg-white font-semibold shadow-sm" : ""}`} onClick={() => setAuthMode("register")}>Register</button></div>{authMode === "login" ? <form className="animate-fadeIn space-y-4" onSubmit={submitLogin}><Field label="Email"><input className={`${inputClass} btn-hover`} type="email" required value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })}/></Field><Field label="Password"><input className={`${inputClass} btn-hover`} type="password" required value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })}/></Field><button className={`${primaryButton} btn-hover w-full`}>Login</button></form> : registerStep === 1 ? <form className="animate-fadeIn space-y-4" onSubmit={requestOtp}><Field label="Name"><input className={`${inputClass} btn-hover`} required value={registration.name} onChange={(event) => setRegistration({ ...registration, name: event.target.value })}/></Field><Field label="Email"><input className={`${inputClass} btn-hover`} type="email" required value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value })}/></Field><Field label="Password"><input className={`${inputClass} btn-hover`} type="password" minLength={8} required value={registration.password} onChange={(event) => setRegistration({ ...registration, password: event.target.value })}/></Field><button className={`${primaryButton} w-full`}>Send OTP</button></form> : <form className="space-y-4" onSubmit={verifyOtp}><p className="text-sm text-zinc-600">Verification code sent to<br/><b>{registration.email}</b></p><Field label="6-digit OTP"><input className={`${inputClass} text-center text-lg tracking-[0.4em]`} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={registration.otp} onChange={(event) => setRegistration({ ...registration, otp: event.target.value.replace(/\D/g, "") })}/></Field><button className={`${primaryButton} w-full`}>Verify & Create Account</button><button type="button" className="w-full text-sm font-semibold text-emerald-700" onClick={() => void requestOtp()}>Resend OTP</button><button type="button" className="w-full text-sm text-zinc-500" onClick={() => setRegisterStep(1)}>Back</button></form>}{(notice || error) && <p className={`mt-4 rounded-lg p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{error || notice}</p>}</div></main>;
}

function RequestList({ title, items, incoming, actions }: { title: string; items: MoneyRequest[]; incoming?: boolean; actions?: (id: string, action: "approve" | "decline") => void }) {
  return <div><h3 className="text-sm font-semibold text-zinc-500">{title}</h3><div className="mt-2 space-y-2">{items.map((item) => <div key={item.id} className="rounded-xl border border-zinc-200 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{incoming ? `${item.person.name} requested ${formatTaka(item.amountPoysha)}` : `Requested ${formatTaka(item.amountPoysha)} from ${item.person.name}`}</p><p className="mt-1 text-xs text-zinc-500">{item.note ? `“${item.note}”` : "No note"} · {item.status}</p></div>{incoming && item.status === "PENDING" && actions && <div className="flex gap-2"><button className="rounded-lg border px-3 py-2 text-xs font-semibold" onClick={() => actions(item.id, "decline")}>Decline</button><button className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white" onClick={() => actions(item.id, "approve")}>Review & Pay</button></div>}</div></div>)}{items.length === 0 && <p className="py-5 text-sm text-zinc-500">No {title.toLowerCase()} requests</p>}</div></div>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="text-lg font-bold tracking-tight">{title}</h2><p className="text-sm text-zinc-500">{subtitle}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-sm font-medium text-zinc-700">{label}</span>{children}</label>; }
function Avatar({ person }: { person: Person }) { return <span className="mx-auto grid size-10 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{initials(person.name) || <UserRound size={16}/>}</span>; }
