type P = { size?: number };
const base = (size = 19) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconChat = ({ size }: P) => (<svg {...base(size)}><path d="M4 5h16v11H9l-5 4z" /></svg>);
export const IconProspects = ({ size }: P) => (
  <svg {...base(size)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.3c2.2.7 3.5 2.8 3.5 5.7" /></svg>
);
export const IconCheck = ({ size }: P) => (<svg {...base(size)}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.4 4.6-4.8" /></svg>);
export const IconLayers = ({ size }: P) => (<svg {...base(size)}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>);
export const IconBook = ({ size }: P) => (<svg {...base(size)}><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></svg>);
export const IconList = ({ size }: P) => (
  <svg {...base(size)}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></svg>
);
export const IconGrid = ({ size }: P) => (
  <svg {...base(size)}><rect x="4" y="4" width="7" height="9" rx="2" /><rect x="13" y="4" width="7" height="5" rx="2" /><rect x="13" y="11" width="7" height="9" rx="2" /><rect x="4" y="15" width="7" height="5" rx="2" /></svg>
);
export const IconGear = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
);
export const IconPlus = ({ size = 22 }: P) => (<svg {...base(size)} strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>);
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

export const Mountain = () => (
  <svg className="mountain" aria-hidden="true" viewBox="0 0 400 130" preserveAspectRatio="none">
    <path d="M0 130 L70 70 L105 92 L175 22 L230 78 L262 56 L330 104 L400 66 L400 130 Z" fill="#8e7ee0" />
    <path d="M175 22 L196 44 L184 42 L176 54 L166 40 L156 42 Z" fill="#f1eeff" />
    <path d="M0 130 L60 98 L120 118 L200 84 L280 112 L340 92 L400 112 L400 130 Z" fill="#6e5cd0" />
  </svg>
);
