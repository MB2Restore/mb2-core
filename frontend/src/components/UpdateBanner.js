import React, { useEffect, useState } from 'react';

// Detects when a new version of MB2 Core has been deployed and offers a refresh.
// How: each production build has a uniquely hashed main.<hash>.js. We fetch a fresh
// index.html and compare its main script name to the one this page loaded with.
// Checks when the app comes back to the foreground and every 10 minutes.

function currentMainScript() {
  const s = Array.from(document.scripts).find(el => /\/static\/js\/main\.[^/]+\.js/.test(el.src));
  return s ? s.src.match(/main\.[^/]+\.js/)[0] : null;
}

function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const loaded = currentMainScript();
    if (!loaded) return; // dev server (no hashed bundle) — nothing to check

    let cancelled = false;
    const check = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const html = await res.text();
        const m = html.match(/main\.[^/"']+\.js/);
        if (m && m[0] !== loaded) setUpdateReady(true);
      } catch (e) {
        // offline or flaky signal — try again next time
      }
    };

    check();
    const timer = setInterval(check, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#1a1a2e', color: '#fff', padding: '12px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      fontSize: 15, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      paddingTop: 'max(12px, env(safe-area-inset-top))'
    }}>
      <span>A new version of MB2 Core is available.</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#fff', color: '#1a1a2e', border: 'none', borderRadius: 6,
          padding: '8px 14px', fontWeight: 600, fontSize: 15, cursor: 'pointer', whiteSpace: 'nowrap'
        }}
      >
        Update now
      </button>
    </div>
  );
}

export default UpdateBanner;
