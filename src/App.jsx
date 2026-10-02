import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { walletSigner } from '@solana/kit-plugin-wallet';
import { getAddMemoInstruction } from '@solana-program/memo';

const API = '/api';
const STORAGE = 'temirtrace-solana-v1';
const RPC = 'https://api.devnet.solana.com';
let accessCode = window.sessionStorage.getItem('temirtrace-access-code') || '';
const client = createClient().use(walletSigner({ chain: 'solana:devnet' })).use(solanaRpc({ rpcUrl: RPC }));
const empty = { org: null, assets: [], events: [] };
const verified = org => ['verified', 'demo_verified'].includes(org?.verification?.status);
const short = (value = '') => value.length > 16 ? `${value.slice(0, 7)}…${value.slice(-6)}` : value;
const prettyDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
async function hashRecord(record) {
  const bytes = new TextEncoder().encode(JSON.stringify({ id: record.id, assetId: record.assetId, title: record.title, date: record.date, provider: record.provider, notes: record.notes }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function request(path, options = {}) {
  const headers = { 'content-type': 'application/json', ...options.headers };
  if (accessCode) headers.authorization = `Bearer ${accessCode}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const error = new Error(body.error || `Server error (${res.status})`); error.status = res.status; throw error; }
  return body;
}

export default function App() {
  const [data, setData] = useState(empty);
  const [loaded, setLoaded] = useState(false);
  const [backend, setBackend] = useState('checking');
  const [walletState, setWalletState] = useState(() => client.wallet.getState());
  const [page, setPage] = useState(() => window.location.pathname.startsWith('/p/') ? 'public' : 'home');
  const [activeAsset, setActiveAsset] = useState(() => window.location.pathname.startsWith('/p/') ? window.location.pathname.split('/')[2] : null);
  const [publicPassport, setPublicPassport] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [needsAccess, setNeedsAccess] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [accessProtected, setAccessProtected] = useState(false);
  const connected = walletState.connected;
  const wallets = walletState.wallets;
  const asset = data.assets.find(x => x.id === activeAsset);
  const events = useMemo(() => data.events.filter(e => !activeAsset || e.assetId === activeAsset), [data.events, activeAsset]);
  const connectedAddress = connected?.account?.address;

  useEffect(() => {
    let live = true;
    const unsub = client.wallet.subscribe(() => setWalletState(client.wallet.getState()));
    if (window.location.pathname.startsWith('/p/')) {
      setBackend('online'); setLoaded(true);
      return () => { live = false; unsub(); };
    }
    request('/health').then(health => { if (live) { setAccessProtected(Boolean(health.accessProtected)); setBackend('online'); } }).catch(() => {});
    request('/state').then(serverData => {
      if (live) { setData({ ...empty, ...serverData }); setBackend('online'); }
    }).catch(e => {
      if (e.status === 401) { if (live) { setNeedsAccess(true); setBackend('checking'); } return; }
      try { if (live) setData({ ...empty, ...JSON.parse(localStorage.getItem(STORAGE) || '{}') }); } catch { /* start clean */ }
      if (live) { setBackend('offline'); setError('Backend is unavailable. Start the TemirTrace server to save shared demo data.'); }
    }).finally(() => { if (live) setLoaded(true); });
    return () => { live = false; unsub(); };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE, JSON.stringify(data));
    if (backend !== 'online') return;
    const timer = setTimeout(() => request('/state', { method: 'PUT', body: JSON.stringify(data) }).catch(e => { setBackend('offline'); setError(`Could not save to backend: ${e.message}`); }), 350);
    return () => clearTimeout(timer);
  }, [data, loaded, backend]);
  const persistNow = async next => {
    try {
      await request('/state', { method: 'PUT', body: JSON.stringify(next) });
      setBackend('online');
    } catch (e) {
      setBackend('offline'); setError(`Backend save failed: ${e.message}`); throw e;
    }
  };
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (page !== 'public' || !activeAsset) return;
    let live = true;
    request(`/public/passport/${encodeURIComponent(activeAsset)}`).then(x => { if (live) setPublicPassport(x); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [page, activeAsset]);

  const saveOrg = async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const orgFields = { id: data.org?.id || crypto.randomUUID(), name: f.get('name').trim(), bin: f.get('bin').trim(), city: f.get('city').trim(), type: f.get('type') };
    const same = data.org && ['name', 'bin', 'city', 'type'].every(k => data.org[k] === orgFields[k]);
    const next = { ...data, org: { ...orgFields, verification: same ? data.org.verification : { status: 'not_verified' } } };
    try { await persistNow(next); setData(next); setPage('verification'); setNotice('Organization profile saved. Submit it for review before issuing passports.'); }
    catch { /* keep the form open and show the backend error */ }
  };
  const submitForReview = async () => {
    const next = { ...data, org: { ...data.org, verification: { status: 'pending', requestedAt: new Date().toISOString() } } };
    try { await persistNow(next); setData(next); setNotice('Review request saved. No government registry check is performed in this demo.'); } catch { /* backend error is visible */ }
  };
  const decideReview = async decision => {
    setError('');
    try {
      const result = await request('/review-queue/decision', { method: 'POST', body: JSON.stringify({ decision, note: reviewNote }) });
      setData(d => ({ ...d, org: result.org }));
      setReviewNote('');
      setNotice(decision === 'approve_demo' ? 'Demo review approved and saved with an audit entry.' : 'Changes requested and saved with an audit entry.');
    } catch (e) { setError(e.message); }
  };
  const addAsset = async e => {
    e.preventDefault(); if (!verified(data.org)) { setPage('verification'); return; }
    const f = new FormData(e.currentTarget);
    const next = { id: crypto.randomUUID(), organizationId: data.org.id, kind: f.get('kind'), make: f.get('make').trim(), model: f.get('model').trim(), year: f.get('year'), code: f.get('code').trim(), createdAt: new Date().toISOString() };
    const nextData = { ...data, assets: [next, ...data.assets] };
    try { await persistNow(nextData); setData(nextData); setActiveAsset(next.id); setPage('asset'); setNotice('Equipment passport created and saved by the TemirTrace backend.'); } catch { /* backend error is visible */ }
  };
  const addEvent = async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const record = { id: crypto.randomUUID(), assetId: activeAsset, title: f.get('title'), date: f.get('date'), provider: f.get('provider').trim(), notes: f.get('notes').trim(), createdAt: new Date().toISOString(), hash: '', signature: '', chainStatus: 'not_submitted' };
    setBusy('hash'); setError('');
    try { record.hash = await hashRecord(record); const nextData = { ...data, events: [record, ...data.events] }; await persistNow(nextData); setData(nextData); setPage('asset'); setNotice('Service record saved. Publish its hash to Devnet as a separate step.'); }
    catch (e2) { setError(`Could not calculate SHA-256: ${e2.message}`); }
    finally { setBusy(''); }
  };
  const connectWallet = async wallet => {
    setBusy('wallet'); setError('');
    try { await client.wallet.connect(wallet); setNotice(`Connected ${wallet.name} on Solana Devnet.`); }
    catch (e) { if (e.name !== 'AbortError') setError(e.message || 'Wallet connection failed.'); }
    finally { setBusy(''); }
  };
  const anchorRecord = async record => {
    if (!connected) { setError('Connect a wallet on Devnet first.'); return; }
    const memo = `TEMIRTRACE|v1|${record.id}|${record.hash}`;
    if (!window.confirm(`Only this public memo will be sent to Solana Devnet:\n\n${memo}\n\nYour wallet will ask you to review and sign. Continue?`)) return;
    setBusy(`anchor:${record.id}`); setError('');
    try {
      const { context } = await client.sendTransaction([getAddMemoInstruction({ memo })]);
      setData(d => ({ ...d, events: d.events.map(x => x.id === record.id ? { ...x, signature: context.signature, chainStatus: 'submitted' } : x) }));
      const result = await request(`/verify/${record.id}`, { method: 'POST', body: JSON.stringify({ signature: context.signature }) });
      setData(d => ({ ...d, events: d.events.map(x => x.id === record.id ? { ...x, chainStatus: result.status, chainBlockTime: result.blockTime || null } : x) }));
      setNotice(result.status === 'confirmed' ? 'Memo found on Solana Devnet and verified by the backend.' : 'Transaction submitted. The backend will verify it after Devnet indexes it; use Verify again in a moment.');
    } catch (e) { setError(`Devnet transaction could not be confirmed: ${e.message}`); }
    finally { setBusy(''); }
  };
  const verifyAgain = async record => {
    setBusy(`verify:${record.id}`); setError('');
    try {
      const result = await request(`/verify/${record.id}`, { method: 'POST', body: JSON.stringify({ signature: record.signature }) });
      setData(d => ({ ...d, events: d.events.map(x => x.id === record.id ? { ...x, chainStatus: result.status, chainBlockTime: result.blockTime || null } : x) }));
      setNotice(result.status === 'confirmed' ? 'On-chain memo verified.' : 'The transaction is not confirmed yet. Try again shortly.');
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };
  const loadDemo = async () => {
    const orgId = crypto.randomUUID(), assetId = crypto.randomUUID();
    const record = { id: crypto.randomUUID(), assetId, title: 'Scheduled maintenance', date: '2026-09-12', provider: 'TemirTrace Demo Service', notes: 'Filters and engine oil replaced. Fictional demo data.', createdAt: new Date().toISOString(), hash: '', signature: '', chainStatus: 'not_submitted' };
    record.hash = await hashRecord(record);
    const nextData = { org: { id: orgId, name: 'Steppe Field Services · Demo', bin: '123456789012', city: 'Kostanay Region', type: 'Agricultural equipment service', verification: { status: 'demo_verified', mode: 'simulation', verifiedAt: new Date().toISOString() } }, assets: [{ id: assetId, organizationId: orgId, kind: 'Tractor', make: 'John Deere', model: '6155M', year: '2020', code: 'DEMO-TR-01', createdAt: new Date().toISOString() }], events: [record] };
    try { await persistNow(nextData); } catch { return; }
    setData(nextData);
    setActiveAsset(assetId); setPage('asset'); setNotice('Fictional demo workspace loaded. Nothing has been written to the blockchain.');
  };
  const sharePassport = assetId => `${window.location.origin}/p/${assetId}`;
  const unlockWorkspace = async code => {
    setAccessBusy(true); setAccessError('');
    try {
      await request('/access', { method: 'POST', body: JSON.stringify({ accessCode: code }) });
      accessCode = code; window.sessionStorage.setItem('temirtrace-access-code', code);
      const serverData = await request('/state');
      setData({ ...empty, ...serverData }); setBackend('online'); setNeedsAccess(false); setLoaded(true);
      return true;
    } catch (e) { accessCode = ''; window.sessionStorage.removeItem('temirtrace-access-code'); setAccessError(e.message); return false; }
    finally { setAccessBusy(false); }
  };

  if (needsAccess) return <AccessGate onUnlock={unlockWorkspace} busy={accessBusy} error={accessError} />;

  return <div className="shell">
    {page !== 'public' && <aside className="side"><div className="brand"><span className="mark">T</span><span><b>TEMIRTRACE</b><small>VERIFIABLE EQUIPMENT HISTORY</small></span></div><div className="nav-title">WORKSPACE</div>
      <button className={`nav ${page === 'home' ? 'selected' : ''}`} onClick={() => { setPage('home'); setActiveAsset(null); }}>▦ <span>Overview</span></button>
      <button className={`nav ${page === 'asset' ? 'selected' : ''}`} onClick={() => asset && setPage('asset')}>▤ <span>Equipment passports</span></button>
      <button className={`nav ${page === 'verification' ? 'selected' : ''}`} onClick={() => setPage(data.org ? 'verification' : 'org')}>✓ <span>Organization review</span></button>
      <button className={`nav ${page === 'reviewer' ? 'selected' : ''}`} onClick={() => setPage('reviewer')}>▣ <span>Reviewer queue · demo</span></button>
      <div className="side-foot"><b>TEST NETWORK</b><span>Solana Devnet · test SOL</span><small>{backend === 'online' ? 'Persistent storage connected' : backend === 'checking' ? 'Connecting to backend…' : 'Backend offline'}</small></div>
    </aside>}
    <main className="main"><header className="top"><span className="crumb">TemirTrace / {page === 'org' ? 'Organization' : page === 'verification' ? 'Organization review' : page === 'asset-form' ? 'New equipment' : page === 'event-form' ? 'New service record' : page === 'public' ? 'Public passport' : asset?.make || 'Overview'}</span>
      <div className="top-right"><span className={`backend-pill ${backend}`}>● {backend === 'online' ? 'BACKEND ONLINE' : backend === 'checking' ? 'CONNECTING' : 'BACKEND OFFLINE'}</span>{accessProtected && <button className="btn" onClick={() => { accessCode = ''; window.sessionStorage.removeItem('temirtrace-access-code'); setNeedsAccess(true); setLoaded(false); }}>Lock app</button>}<div className="wallet">{connected ? <><span className="network"><i />DEVNET</span><button className="wallet-btn" onClick={() => client.wallet.disconnect()} title="Disconnect wallet">◉ {short(connectedAddress)} <small>×</small></button></> : <div className="wallet-menu"><button className="btn dark" disabled={!wallets.length || busy === 'wallet'} onClick={() => wallets.length === 1 ? connectWallet(wallets[0]) : setPage(page === 'wallets' ? 'home' : 'wallets')}>{busy === 'wallet' ? 'Connecting…' : 'Connect wallet'}</button>{page === 'wallets' && <div className="wallet-pop">{wallets.length ? wallets.map(w => <button key={w.name} onClick={() => connectWallet(w)}>{w.name}</button>) : <span>No Wallet Standard wallet detected. Install Phantom from its official site, then reopen this page in the same browser.</span>}</div>}</div>}</div></div>
    </header>
    <div className="content">
      {notice && <div className="toast">✓ {notice}<button onClick={() => setNotice('')}>×</button></div>}{error && <div className="error">{error}<button onClick={() => setError('')}>×</button></div>}
      {page !== 'public' && <div className="chain-banner"><span>⛓</span><div><b>Solana Devnet integration</b><small>Service records are stored in the TemirTrace database. Only the record ID and SHA-256 hash go on-chain after your wallet approval. Pilot mode only—use fictional data.</small></div><span className="dev-pill">DEVNET</span></div>}
      {page === 'home' && <>
        <div className="heading"><div><label>EQUIPMENT TRUST</label><h1>Equipment passports</h1><p>Service history with a verifiable blockchain timestamp.</p></div><div className="buttons"><button className="btn" onClick={() => setPage(data.org ? 'org' : 'org')}>Organization profile</button><button className="btn primary" disabled={!verified(data.org)} title={!verified(data.org) ? 'Complete organization review first' : ''} onClick={() => setPage('asset-form')}>＋ Add equipment</button></div></div>
        {!data.org && <section className="welcome"><div className="welcome-icon">✳</div><div><b>Start with an organization profile</b><p>For this demo, passport creation is unlocked after a simulated review.</p></div><button className="btn primary" onClick={() => setPage('org')}>Create profile →</button></section>}
        {data.org && <section className={`verification-strip ${verified(data.org) ? 'ok' : ''}`}><span>{verified(data.org) ? '✓' : '!'}</span><div><b>{verified(data.org) ? 'Organization approved · demo' : data.org.verification?.status === 'pending' ? 'Review pending' : 'Review the organization before issuing passports'}</b><small>{verified(data.org) ? `BIN ${data.org.bin} · simulated status, not a government check` : 'New equipment passports are locked until approval.'}</small></div><button className="btn" onClick={() => setPage('verification')}>Review status →</button></section>}
        <div className="stats"><div className="stat"><span>Equipment</span><strong>{data.assets.length}</strong></div><div className="stat"><span>Service records</span><strong>{data.events.length}</strong></div><div className="stat"><span>Devnet proofs verified</span><strong>{data.events.filter(x => x.chainStatus === 'confirmed').length}</strong></div></div>
        <div className="columns"><section className="panel"><div className="panel-head"><div><h2>Organization equipment</h2><p>{data.org ? `${data.org.name} · ${data.org.city}` : 'Your equipment passports'}</p></div><span className="count">{data.assets.length} passports</span></div>{data.assets.length ? <div className="asset-list">{data.assets.map(a => <button className="asset" key={a.id} onClick={() => { setActiveAsset(a.id); setPage('asset'); }}><span className="machine">▰</span><span><b>{a.make} {a.model}</b><small>{a.kind} · {a.year} · ID {a.code}</small></span><span className="arrow">→</span></button>)}</div> : <div className="empty"><span>▤</span><b>No equipment yet</b><p>Create a passport after organization review.</p></div>}</section>
          <section className="panel org-panel"><div className="panel-head"><div><h2>Organization</h2><p>Managed by the local demo backend</p></div><button className="link-btn" onClick={() => setPage('org')}>Edit →</button></div>{data.org ? <div className="org-box"><span className="org-icon">⌂</span><div><b>{data.org.name}</b><small>{data.org.city} · BIN {data.org.bin}</small></div><span className={`local-tag ${verified(data.org) ? 'verified-tag' : ''}`}>{verified(data.org) ? 'DEMO APPROVED' : 'NOT REVIEWED'}</span></div> : <p className="muted">No organization profile yet.</p>}<button className="link-btn verify-link" onClick={() => setPage(data.org ? 'verification' : 'org')}>{data.org ? 'Open review →' : 'Create profile →'}</button><div className="mini-chain"><span>◆</span><div><b>{connected ? 'Wallet connected' : 'Wallet not connected'}</b><small>{connected ? `${short(connectedAddress)} · Solana Devnet` : 'A wallet is needed to sign an on-chain proof'}</small></div></div></section></div>
        <section className="panel recent"><div className="panel-head"><div><h2>Recent service records</h2><p>Backend persistence · on-chain status checked separately</p></div>{!data.org && <button className="btn" onClick={loadDemo}>Load sample demo</button>}</div>{data.events.slice(0, 4).map(ev => <div className="recent-row" key={ev.id}><span className="event-icon">✓</span><div><b>{ev.title}</b><small>{data.assets.find(a => a.id === ev.assetId)?.make} {data.assets.find(a => a.id === ev.assetId)?.model} · {prettyDate(ev.date)}</small></div><span className={`state ${ev.chainStatus === 'confirmed' ? 'confirmed' : ''}`}>{ev.chainStatus === 'confirmed' ? 'Proof verified' : ev.signature ? 'Submitted' : 'Backend only'}</span></div>)}{!data.events.length && <p className="muted">Add a service record to begin.</p>}</section>
      </>}
      {page === 'org' && <FormPage title="Organization profile" subtitle="BIN is checked for format only; no registry lookup occurs in this demo." onCancel={() => setPage('home')} onSubmit={saveOrg} submitLabel="Save and continue"><Field label="Organization name" name="name" required defaultValue={data.org?.name || ''} /><Field label="Business identification number (BIN)" name="bin" required pattern="[0-9]{12}" inputMode="numeric" placeholder="12 digits" defaultValue={data.org?.bin || ''} /><Field label="City or region" name="city" required defaultValue={data.org?.city || ''} /><Field label="Business type" name="type" select options={['Equipment maintenance','Equipment owner','Equipment dealer','Other']} defaultValue={data.org?.type || ''} /></FormPage>}
      {page === 'verification' && <section className="form-card verification-page"><button className="back" type="button" onClick={() => setPage('home')}>← Overview</button><label>TRUST AND IDENTITY</label><h1>Organization review</h1><p>Submit the organization profile to the pilot review queue.</p>{!data.org ? <div className="verify-state"><b>Create an organization profile first</b><small>Enter the business name, region, type, and BIN.</small><button className="btn primary" onClick={() => setPage('org')}>Create profile</button></div> : <><div className={`verify-state ${verified(data.org) ? 'success' : ''}`}><span className="verify-symbol">{verified(data.org) ? '✓' : data.org.verification?.status === 'pending' ? '◷' : '!'}</span><b>{verified(data.org) ? 'Demo approved' : data.org.verification?.status === 'pending' ? 'Review pending' : data.org.verification?.status === 'needs_changes' ? 'Changes requested' : 'Not reviewed'}</b><small>{data.org.name} · BIN {data.org.bin} · {data.org.city}</small><small>{verified(data.org) ? 'Demo decision only; this does not verify the company in a government registry.' : data.org.verification?.status === 'pending' ? 'Your request is waiting in the reviewer queue.' : data.org.verification?.status === 'needs_changes' ? `Reviewer note: ${data.org.verification.note || 'See review history.'}` : 'New equipment passports remain locked until approval.'}</small></div>{data.org.verification?.status !== 'pending' && !verified(data.org) && <button className="btn primary" onClick={submitForReview}>Submit for review</button>}{verified(data.org) && <button className="btn primary" onClick={() => setPage('asset-form')}>＋ Add equipment</button>}{data.org.reviewHistory?.length > 0 && <div className="verification-steps"><b>Decision history</b>{data.org.reviewHistory.map((entry, i) => <p key={`${entry.reviewedAt}-${i}`}>{entry.decision === 'approve_demo' ? 'Demo approved' : 'Changes requested'} · {new Date(entry.reviewedAt).toLocaleString()}<br />{entry.note}</p>)}</div>}</>}<div className="verification-steps"><b>Demo limitation</b><small>Review decisions are stored in MySQL. This demo uses one shared pilot access code, not separate reviewer accounts; it does not query a government registry.</small></div></section>}
      {page === 'reviewer' && <section className="form-card verification-page"><button className="back" type="button" onClick={() => setPage('home')}>← Overview</button><label>LOCAL DEMO WORKFLOW</label><h1>Reviewer queue</h1><p>This screen simulates a reviewer role for the running local demo.</p>{!data.org || data.org.verification?.status !== 'pending' ? <div className="verify-state"><b>No pending requests</b><small>Submit an organization profile for review to add it to this queue.</small></div> : <><div className="verify-state"><b>{data.org.name}</b><small>BIN {data.org.bin} · {data.org.city} · {data.org.type}</small><small>Submitted {data.org.verification.requestedAt ? new Date(data.org.verification.requestedAt).toLocaleString() : '—'}</small></div><label className="field"><span>Reviewer note (required)</span><textarea rows="3" maxLength="500" value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="What did you check? What should be corrected?" /></label><div className="buttons" style={{ marginTop: 14 }}><button className="btn primary" disabled={!reviewNote.trim()} onClick={() => decideReview('approve_demo')}>Approve · demo</button><button className="btn" disabled={!reviewNote.trim()} onClick={() => decideReview('request_changes')}>Request changes</button></div></>}<div className="verification-steps"><b>For presentation only</b><small>This local reviewer screen has no real login or access control. A public service needs separate user accounts, server-enforced reviewer permissions, an official verification source, and privacy/legal review.</small></div></section>}
      {page === 'asset-form' && verified(data.org) && <FormPage title="New equipment passport" subtitle="Create a maintenance history for this asset." onCancel={() => setPage('home')} onSubmit={addAsset} submitLabel="Create passport"><Field label="Equipment category" name="kind" required placeholder="Tractor, truck…" /><Field label="Manufacturer" name="make" required placeholder="John Deere" /><Field label="Model" name="model" required placeholder="6155M" /><Field label="Year" name="year" type="number" min="1950" max="2035" required /><Field label="Internal asset ID" name="code" required placeholder="TRACTOR-01" /></FormPage>}
      {page === 'event-form' && asset && <FormPage title="Add service record" subtitle={`${asset.make} ${asset.model} · ${asset.code}`} onCancel={() => setPage('asset')} onSubmit={addEvent} submitLabel={busy === 'hash' ? 'Calculating hash…' : 'Save record'}><Field label="Service type" name="title" select required defaultValue="" options={['Scheduled maintenance','Repair','Inspection','Parts replacement']} /><Field label="Service date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /><Field label="Service provider" name="provider" required defaultValue={data.org?.name || ''} /><Field label="Notes (avoid personal data)" name="notes" textarea placeholder="For example: replaced oil and filters" /></FormPage>}
      {page === 'asset' && asset && <><div className="heading"><div><button className="back" onClick={() => setPage('home')}>← All passports</button><label>EQUIPMENT PASSPORT</label><h1>{asset.make} {asset.model}</h1><p>{asset.kind} · {asset.year} · ID {asset.code}</p></div><div className="buttons"><button className="btn" onClick={() => navigator.clipboard.writeText(sharePassport(asset.id)).then(() => setNotice('Public passport link copied.'))}>Copy public link</button><button className="btn primary" onClick={() => setPage('event-form')}>＋ Add service record</button></div></div><div className="columns asset-columns"><section className="panel"><div className="panel-head"><div><h2>Service history</h2><p>Records saved in the hosted database; chain proofs are independently checked.</p></div></div>{events.length ? events.map(ev => <div className="service-card" key={ev.id}><div className="service-top"><div><b>{ev.title}</b><small>{prettyDate(ev.date)} · {ev.provider}</small></div><span className={`state ${ev.chainStatus === 'confirmed' ? 'confirmed' : ''}`}>{ev.chainStatus === 'confirmed' ? 'On-chain proof verified' : ev.signature ? 'Submitted · verify pending' : 'Backend record'}</span></div>{ev.notes && <p className="notes">{ev.notes}</p>}<div className="hash-box"><small>SHA-256 · record fingerprint</small><code>{ev.hash}</code></div>{ev.signature ? <div className="tx-box"><span>Solana Devnet transaction</span><code>{short(ev.signature)}</code><a href={`https://explorer.solana.com/tx/${ev.signature}?cluster=devnet`} target="_blank" rel="noreferrer">Open in Solana Explorer ↗</a>{ev.chainStatus !== 'confirmed' && <button className="btn" disabled={busy === `verify:${ev.id}`} onClick={() => verifyAgain(ev)}>{busy === `verify:${ev.id}` ? 'Checking…' : 'Verify on-chain proof'}</button>}</div> : <button className="btn primary anchor-btn" disabled={!connected || busy === `anchor:${ev.id}`} onClick={() => anchorRecord(ev)}>{busy === `anchor:${ev.id}` ? 'Waiting for wallet and backend…' : connected ? 'Publish hash to Devnet' : 'Connect a Devnet wallet to publish'}</button>}</div>) : <div className="empty"><span>⌁</span><b>No service records yet</b><p>Add the first inspection or maintenance event.</p><button className="btn primary" onClick={() => setPage('event-form')}>Add service record</button></div>}</section><section className="panel explain"><div className="panel-head"><div><h2>How proof works</h2><p>Backend persistence plus a verifiable Devnet receipt</p></div></div><ol><li><b>Backend stores the record</b><small>Organization, equipment, and service details stay in the hosted database.</small></li><li><b>SHA-256 fingerprints the record</b><small>Changing a field changes the hash.</small></li><li><b>Your wallet signs a memo</b><small>Only the record ID and hash are public on Devnet.</small></li><li><b>Backend checks Solana</b><small>It fetches the transaction and compares the on-chain memo with the saved record hash.</small></li></ol><div className="privacy-note">Public: wallet address, timestamp, record ID, and hash. Hashing does not encrypt data. Demo records do not prove that work actually happened.</div></section></div></>}
      {page === 'public' && <PublicPassport data={publicPassport} onBack={() => { window.history.pushState({}, '', '/'); setPage('home'); setActiveAsset(null); }} />}
    </div>
  </main></div>;
}

function Field({ label, name, select, textarea, options = [], ...props }) {
  return <label className="field"><span>{label}</span>{select ? <select name={name} required={props.required} defaultValue={props.defaultValue || ''}>{!props.required && <option value="">Choose one</option>}{props.required && !props.defaultValue && <option value="" disabled>Choose one</option>}{options.map(o => <option key={o}>{o}</option>)}</select> : textarea ? <textarea name={name} maxLength="160" rows="4" {...props} /> : <input name={name} {...props} />}</label>;
}
function FormPage({ title, subtitle, onCancel, onSubmit, submitLabel, children }) {
  return <section className="form-card"><button className="back" type="button" onClick={onCancel}>← Back</button><label>WORKSPACE</label><h1>{title}</h1><p>{subtitle}</p><form onSubmit={onSubmit}><div className="form-grid">{children}</div><div className="form-actions"><span>Saved by the local TemirTrace backend</span><button className="btn primary" type="submit">{submitLabel}</button></div></form></section>;
}
function PublicPassport({ data, onBack }) {
  if (!data) return <section className="form-card"><button className="back" onClick={onBack}>← Back to app</button><h1>Loading passport…</h1></section>;
  if (data.error) return <section className="form-card"><button className="back" onClick={onBack}>← Back to app</button><h1>Passport not found</h1><p>This public link may be invalid or the server is unavailable.</p></section>;
  return <section className="public-passport"><div className="public-head"><span className="mark">T</span><div><b>TEMIRTRACE</b><small>PUBLIC EQUIPMENT PASSPORT</small></div><button className="btn" onClick={onBack}>Open app</button></div><div className="chain-banner"><span>◈</span><div><b>Equipment history</b><small>Public view · records and Devnet proof status are shown separately.</small></div><span className="dev-pill">DEVNET</span></div><section className="panel"><label>ASSET PASSPORT</label><h1>{data.asset.make} {data.asset.model}</h1><p>{data.asset.kind} · {data.asset.year} · Asset ID {data.asset.code}</p><div className="public-org"><b>Issued by</b><span>{data.organization.name}</span><small>{data.organization.city} · {data.organization.verificationLabel}</small></div></section><section className="panel public-history"><div className="panel-head"><div><h2>Service history</h2><p>{data.events.length} record(s)</p></div></div>{data.events.length ? data.events.map(ev => <div className="service-card" key={ev.id}><div className="service-top"><div><b>{ev.title}</b><small>{prettyDate(ev.date)} · {ev.provider}</small></div><span className={`state ${ev.chainStatus === 'confirmed' ? 'confirmed' : ''}`}>{ev.chainStatus === 'confirmed' ? 'On-chain proof verified' : ev.signature ? 'Proof submitted, pending check' : 'No chain proof'}</span></div>{ev.notes && <p className="notes">{ev.notes}</p>}<div className="hash-box"><small>Record SHA-256</small><code>{ev.hash}</code></div>{ev.signature && <a className="explorer-link" href={`https://explorer.solana.com/tx/${ev.signature}?cluster=devnet`} target="_blank" rel="noreferrer">View Devnet transaction ↗</a>}</div>) : <div className="empty">No service records have been added.</div>}</section><p className="public-disclaimer">A blockchain hash proves that a matching hash was submitted, not that the company or service record is truthful. Organization review in this demo is simulated.</p></section>;
}

function AccessGate({ onUnlock, busy, error }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const submit = async e => {
    e.preventDefault(); setMessage('');
    const ok = await onUnlock(code);
    if (!ok) setMessage(error || 'Access could not be verified. Check the code and try again.');
  };
  return <main className="shell" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
    <section className="form-card" style={{ width: 'min(100%, 460px)' }}>
      <div className="brand"><span className="mark">T</span><span><b>TEMIRTRACE</b><small>PRIVATE PILOT WORKSPACE</small></span></div>
      <h1 style={{ marginTop: 32 }}>Enter demo access code</h1>
      <p>This pilot is limited to people who have been given the access code.</p>
      <form onSubmit={submit}>
        <label className="field"><span>Access code</span><input type="password" autoComplete="current-password" value={code} onChange={e => setCode(e.target.value)} required autoFocus /></label>
        {(message || error) && <p role="alert" style={{ color: '#a93636' }}>{message || error}</p>}
        <div className="form-actions"><span>Solana Devnet · test data only</span><button className="btn primary" disabled={busy}>{busy ? 'Checking…' : 'Open workspace'}</button></div>
      </form>
    </section>
  </main>;
}
