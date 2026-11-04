type P = { size?: number };
const base = (size = 19) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

/* Icônes du menu : un trait net et une forme pleine à 20 % (même couleur que le trait), pour du relief sans changer de couleur. */
const D = { fill: "currentColor", fillOpacity: 0.2 } as const;

export const IconChat = ({ size }: P) => (
  <svg {...base(size)}><path {...D} d="M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v7.5a2.5 2.5 0 0 1-2.5 2.5h-5.4L8 20.5V17H6a2.5 2.5 0 0 1-2.5-2.5V7A2.5 2.5 0 0 1 6 4.5z" /><path d="M8 9.5h8M8 13h4.5" /></svg>
);
export const IconProspects = ({ size }: P) => (
  <svg {...base(size)}><circle {...D} cx="9.5" cy="8.2" r="3.3" /><path {...D} d="M3.2 19.8c.3-3.4 2.8-5.4 6.3-5.4s6 2 6.3 5.4z" /><path d="M15.4 5.2a3.2 3.2 0 0 1 0 6" /><path d="M18 14.6c1.8.7 2.9 2.3 3.2 5.2" /></svg>
);
export const IconCheck = ({ size }: P) => (
  <svg {...base(size)}><path {...D} d="M8.2 3.5h7.6v3H8.2z" /><path d="M8.2 5H6.5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1.7" /><path d="M8.5 14l2.5 2.5 4.6-5" /></svg>
);
export const IconLayers = ({ size }: P) => (
  <svg {...base(size)}><path {...D} d="M12 3.2l8.5 4.6-8.5 4.6-8.5-4.6z" /><path d="M3.5 12.2l8.5 4.6 8.5-4.6" /><path d="M3.5 16.6L12 21.2l8.5-4.6" /></svg>
);
export const IconBook = ({ size }: P) => (
  <svg {...base(size)}><path {...D} d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h10.5" /><path d="M9 8.5h5" /></svg>
);
export const IconList = ({ size }: P) => (
  <svg {...base(size)}><rect {...D} x="4.5" y="3.5" width="15" height="17" rx="2.2" /><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" /></svg>
);
export const IconRadar = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path {...D} d="M12 12L18.4 5.6A9 9 0 0 1 21 12z" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /></svg>
);
export const IconChart = ({ size }: P) => (
  <svg {...base(size)}><rect {...D} x="4" y="12" width="4" height="8" rx="1.2" /><rect {...D} x="10" y="7.5" width="4" height="12.5" rx="1.2" /><rect {...D} x="16" y="3.5" width="4" height="16.5" rx="1.2" /></svg>
);
export const IconPen = ({ size }: P) => (
  <svg {...base(size)}><path {...D} d="M4 20l1.2-4.6L16.4 4.2a2.2 2.2 0 0 1 3.1 3.1L8.3 18.5z" /><path d="M14.6 6l3.4 3.4" /><path d="M12.5 20.5H20" /></svg>
);
export const IconClip = ({ size }: P) => (
  <svg {...base(size)}><path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.8 17a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6" /></svg>
);
export const IconTrash = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6.5 7l1 12.5h9l1-12.5" /><path d="M10 11v5M14 11v5" /></svg>
);
export const IconMegaphone = ({ size }: P) => (
  <svg {...base(size)}><path {...D} d="M4 10.5v3a1 1 0 0 0 1 1h2.5L16 19V5L7.5 9.5H5a1 1 0 0 0-1 1z" /><path d="M19 9a4 4 0 0 1 0 6" /><path d="M8.2 14.8l.7 3.7a1.4 1.4 0 0 0 2.8-.4V16" /></svg>
);
export const IconGrid = ({ size }: P) => (
  <svg {...base(size)}><rect x="4" y="4" width="7" height="9" rx="2" /><rect x="13" y="4" width="7" height="5" rx="2" /><rect x="13" y="11" width="7" height="9" rx="2" /><rect x="4" y="15" width="7" height="5" rx="2" /></svg>
);
export const IconGear = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
);
export const IconSliders = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
export const IconPlus =({ size = 22 }: P) => (<svg {...base(size)} strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>);
export const IconSend = ({ size = 18 }: P) => (<svg {...base(size)} strokeWidth={2}><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></svg>);
export const IconOk = ({ size = 18 }: P) => (<svg {...base(size)} stroke="#2bb48a" strokeWidth={2.2}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
export const IconFail = ({ size = 18 }: P) => (<svg {...base(size)} stroke="#c2410c" strokeWidth={2.2}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const IconStop = () => (<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="2" fill="currentColor" /></svg>);

export const Spark = ({ size = 30, color = "#c8f08f" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2l2.2 6.1L20.5 6l-3.6 5.6L22 14.8l-6.4.4L14 22l-2-6.2L8 22l-1.6-6.8L0 14.8l5.1-3.2L1.5 6l6.3 2.1z" fill={color} />
  </svg>
);

export const Flame = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 .2 2 1.2 3 2.5 3 0-3-1-5.5 0-9z" fill="#f26b3a" />
  </svg>
);
