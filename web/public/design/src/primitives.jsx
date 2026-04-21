// PRIMITIVES — modern app

const { useState, useEffect, useRef, useMemo } = React;

function PageHead({ eyebrow, title, zh, kicker }) {
  return (
    <div className="page-head-new">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}{zh && <span className="zh">{zh}</span>}</h1>
      {kicker && <div className="kicker">{kicker}</div>}
    </div>
  );
}

function Section({ title, zh, tools, children }) {
  return (
    <div>
      <div className="section-title">
        <h2>{title}{zh && <span className="zh">{zh}</span>}</h2>
        {tools && <div className="tools">{tools}</div>}
      </div>
      {children}
    </div>
  );
}

function Progress({ value, thin, strong }) {
  const cls = `progress ${thin ? 'thin' : ''} ${strong ? 'strong' : ''}`;
  return (
    <div className={cls}>
      <div className="fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

function Chip({ children, kind, dot }) {
  return (
    <span className={`chip ${kind || ''}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

function Glyph({ name, size = 18, stroke = 1.6 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case 'home':     return <svg {...p}><path d="M3 10 L12 3 L21 10 V20 H3 Z"/><path d="M9 20 V13 H15 V20"/></svg>;
    case 'plus':     return <svg {...p}><path d="M12 5 V19 M5 12 H19"/></svg>;
    case 'book':     return <svg {...p}><path d="M4 5 A2 2 0 0 1 6 3 H20 V19 H6 A2 2 0 0 0 4 21 Z"/><path d="M4 19 A2 2 0 0 1 6 17 H20"/></svg>;
    case 'layers':   return <svg {...p}><path d="M12 3 L21 8 L12 13 L3 8 Z"/><path d="M3 13 L12 18 L21 13"/></svg>;
    case 'play':     return <svg {...p}><path d="M6 4 L19 12 L6 20 Z" fill="currentColor" stroke="none"/></svg>;
    case 'pause':    return <svg {...p}><rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/></svg>;
    case 'search':   return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M16 16 L21 21"/></svg>;
    case 'bell':     return <svg {...p}><path d="M6 10 A6 6 0 0 1 18 10 V14 L20 17 H4 L6 14 Z"/><path d="M10 20 A2 2 0 0 0 14 20"/></svg>;
    case 'settings': return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M12 3 V5 M12 19 V21 M3 12 H5 M19 12 H21 M5.6 5.6 L7 7 M17 17 L18.4 18.4 M5.6 18.4 L7 17 M17 7 L18.4 5.6"/></svg>;
    case 'flame':    return <svg {...p}><path d="M12 3 C12 7 16 8 16 13 A4 4 0 0 1 8 13 C8 11 9 10 10 9 C10 11 11 12 12 11 C12 9 11 7 12 3 Z"/></svg>;
    case 'clock':    return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7 V12 L15 14"/></svg>;
    case 'sparkles': return <svg {...p}><path d="M12 3 L13.5 9 L19 10.5 L13.5 12 L12 18 L10.5 12 L5 10.5 L10.5 9 Z"/></svg>;
    case 'arrow':    return <svg {...p}><path d="M5 12 H19 M13 6 L19 12 L13 18"/></svg>;
    case 'check':    return <svg {...p}><path d="M5 12 L10 17 L19 7"/></svg>;
    case 'x':        return <svg {...p}><path d="M6 6 L18 18 M18 6 L6 18"/></svg>;
    case 'menu':     return <svg {...p}><path d="M4 7 H20 M4 12 H20 M4 17 H20"/></svg>;
    case 'grid':     return <svg {...p}><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg>;
    case 'list':     return <svg {...p}><path d="M8 6 H20 M8 12 H20 M8 18 H20"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>;
    case 'upload':   return <svg {...p}><path d="M4 16 V19 A1 1 0 0 0 5 20 H19 A1 1 0 0 0 20 19 V16"/><path d="M12 4 V15 M7 9 L12 4 L17 9"/></svg>;
    case 'doc':      return <svg {...p}><path d="M6 3 H14 L18 7 V21 H6 Z"/><path d="M14 3 V7 H18"/></svg>;
    case 'flag':     return <svg {...p}><path d="M5 21 V3 L18 6 L5 9"/></svg>;
    case 'dots':     return <svg {...p}><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>;
    case 'filter':   return <svg {...p}><path d="M4 5 H20 L14 12 V19 L10 17 V12 Z"/></svg>;
    case 'phone':    return <svg {...p}><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 18 H14"/></svg>;
    case 'desktop':  return <svg {...p}><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20 H16 M12 16 V20"/></svg>;
    default: return null;
  }
}

Object.assign(window, { PageHead, Section, Progress, Chip, Glyph });
