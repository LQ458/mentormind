// CHROME — modern sidebar/topbar + phone

const NAV = [
  { id: 'today',   label: 'Today',      zh: '今日',   icon: 'home' },
  { id: 'create',  label: 'Create',     zh: '创建',   icon: 'plus' },
  { id: 'plan',    label: 'Study plan', zh: '学习计划', icon: 'layers', badge: '3' },
  { id: 'lesson',  label: 'Lesson',     zh: '课',    icon: 'play' },
  { id: 'library', label: 'Library',    zh: '文库',   icon: 'book' },
];

function TopBar({ current }) {
  const page = NAV.find(n => n.id === current) || NAV[0];
  return (
    <div className="topbar">
      <div className="page-title">
        {page.label}<span className="zh">{page.zh}</span>
      </div>
      <div className="search-pill">
        <Glyph name="search" size={16}/>
        <input placeholder="Search lessons, concepts, notes…"/>
        <span className="kbd">⌘K</span>
      </div>
      <div className="lang-toggle">
        <span className="on">EN</span><span>中文</span>
      </div>
      <button className="icon-btn dot"><Glyph name="bell" size={18}/></button>
      <button className="avatar-btn">W</button>
    </div>
  );
}

function SideBar({ current, setCurrent }) {
  return (
    <div className="sidebar">
      <div className="sb-brand">
        <div className="glyph">M</div>
        <div className="wordmark">MentorMind<span className="zh">导师</span></div>
      </div>

      <div className="sb-section">
        {NAV.map(n => (
          <div key={n.id}
            className={`sb-item ${current === n.id ? 'active' : ''}`}
            onClick={() => setCurrent(n.id)}>
            <Glyph name={n.icon} size={18} stroke={1.6}/>
            <span>{n.label}</span>
            {n.badge && <span className="badge">{n.badge}</span>}
          </div>
        ))}
      </div>

      <div className="sb-section">
        <div className="sb-head">Your subjects</div>
        {[
          { k:'IB Math AA HL', pct: 37, active: true },
          { k:'IB Physics HL', pct: 18 },
          { k:'English Lang & Lit', pct: 54 },
        ].map(s => (
          <div key={s.k} className="sb-item" style={{flexDirection:'column', alignItems:'stretch', gap: 6, padding: '10px'}}>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:13}}>
              <span style={{fontWeight: s.active ? 500 : 400}}>{s.k}</span>
              <span className="muted small">{s.pct}%</span>
            </div>
            <Progress value={s.pct/100} thin strong={s.active}/>
          </div>
        ))}
      </div>

      <div className="sb-user">
        <div className="avatar">W</div>
        <div style={{flex: 1}}>
          <div className="name">Wei Chen</div>
          <div className="role">Year 12 · IB HL</div>
        </div>
        <Glyph name="settings" size={16}/>
      </div>
    </div>
  );
}

Object.assign(window, { TopBar, SideBar, NAV });
