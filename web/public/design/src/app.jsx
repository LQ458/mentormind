// APP — modern shell + tweaks + view toggle (standalone)

const { useState, useEffect } = React;

const SCREENS = {
  today:   window.ScreenToday,
  create:  window.ScreenCreate,
  plan:    window.ScreenPlan,
  lesson:  window.ScreenLesson,
  library: window.ScreenLibrary,
};

function Tweaks({ tweaks, setTweaks, onClose }) {
  const set = (k, v) => {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    try { localStorage.setItem('mm:tweaks', JSON.stringify(next)); } catch (e) {}
    window.parent?.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
  };

  const Group = ({ label, k, opts }) => (
    <div className="tw-group">
      <div className="tw-label">{label}</div>
      <div className="tw-row">
        {opts.map(o => (
          <button key={o.v}
            className={`tw-btn ${tweaks[k] === o.v ? 'active' : ''}`}
            onClick={() => set(k, o.v)}>{o.t}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="tweaks">
      <h3>Tweaks <span className="close" onClick={onClose}>close</span></h3>
      <p className="desc">Live-edit the look. Saved to your browser.</p>
      <Group label="Palette" k="palette" opts={[
        { v:'cloud',    t:'Cloud' },
        { v:'warm',     t:'Warm' },
        { v:'graphite', t:'Graph' },
        { v:'midnight', t:'Night' },
      ]}/>
      <Group label="Accent" k="accent" opts={[
        { v:'blue',   t:'Blue' },
        { v:'violet', t:'Violet' },
        { v:'green',  t:'Green' },
        { v:'rose',   t:'Rose' },
      ]}/>
      <Group label="Density" k="density" opts={[
        { v:'comfortable', t:'Comfy' },
        { v:'spacious',    t:'Spacious' },
      ]}/>
      <Group label="View" k="view" opts={[
        { v:'desktop', t:'Desktop' },
        { v:'phone',   t:'Phone' },
        { v:'both',    t:'Both' },
      ]}/>
    </div>
  );
}

function TweaksTrigger({ onOpen }) {
  return (
    <button
      onClick={onOpen}
      title="Customize look (palette, accent, density, view)"
      style={{
        position: 'fixed',
        right: 20, bottom: 20,
        zIndex: 99,
        padding: '10px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 999,
        color: 'var(--ink)',
        fontFamily: 'var(--sans)',
        fontSize: 13,
        fontWeight: 500,
        boxShadow: 'var(--shadow)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
      }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 3 V5 M12 19 V21 M3 12 H5 M19 12 H21 M5.6 5.6 L7 7 M17 17 L18.4 18.4 M5.6 18.4 L7 17 M17 7 L18.4 5.6"/>
      </svg>
      Tweaks
    </button>
  );
}

function App() {
  const [current, setCurrent]  = useState(() => localStorage.getItem('mm:screen') || 'today');
  const [phoneScreen, setPhoneScreen] = useState(() => localStorage.getItem('mm:phoneScreen') || 'today');
  const [tweaks, setTweaks]    = useState(window.__TWEAKS);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  useEffect(() => { localStorage.setItem('mm:screen', current); }, [current]);
  useEffect(() => { localStorage.setItem('mm:phoneScreen', phoneScreen); }, [phoneScreen]);

  useEffect(() => {
    const root = document.body;
    root.dataset.palette = tweaks.palette;
    root.dataset.accent  = tweaks.accent;
    root.dataset.density = tweaks.density;
  }, [tweaks]);

  useEffect(() => {
    const listener = (e) => {
      if (e.data?.type === '__activate_edit_mode')   setTweaksOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', listener);
    window.parent?.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', listener);
  }, []);

  const Screen = SCREENS[current] || SCREENS.today;
  const view = tweaks.view || 'desktop';

  const tweaksUi = tweaksOpen
    ? <Tweaks tweaks={tweaks} setTweaks={setTweaks} onClose={() => setTweaksOpen(false)}/>
    : <TweaksTrigger onOpen={() => setTweaksOpen(true)}/>;

  // PHONE ONLY
  if (view === 'phone') {
    return (
      <>
        <div className="phone-wrap">
          <PhoneFrame phoneScreen={phoneScreen} setPhoneScreen={setPhoneScreen}/>
        </div>
        {tweaksUi}
      </>
    );
  }

  // BOTH (desktop + phone side by side)
  if (view === 'both') {
    return (
      <>
        <div style={{display:'grid', gridTemplateColumns:'1fr 450px', minHeight:'100vh', background:'var(--bg)'}}>
          <div className="app" style={{minHeight:'100vh'}} data-screen-label={`desktop / ${current}`}>
            <SideBar current={current} setCurrent={setCurrent}/>
            <TopBar current={current}/>
            <div className="main">
              <div className="main-inner" style={{padding: '8px 28px 80px'}}>
                <Screen setCurrent={setCurrent}/>
              </div>
            </div>
          </div>
          <div className="phone-wrap phone-wrap-desktop-embed" data-screen-label={`phone / ${phoneScreen}`}>
            <PhoneFrame phoneScreen={phoneScreen} setPhoneScreen={setPhoneScreen}/>
          </div>
        </div>
        {tweaksUi}
      </>
    );
  }

  // DESKTOP
  return (
    <>
      <div className="app" data-screen-label={`desktop / ${current}`}>
        <SideBar current={current} setCurrent={setCurrent}/>
        <TopBar current={current}/>
        <div className="main">
          <div className="main-inner">
            <Screen setCurrent={setCurrent}/>
          </div>
        </div>
      </div>
      {tweaksUi}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
