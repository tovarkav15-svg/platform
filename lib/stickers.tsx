// Свои анимированные стикеры: векторные, без чужих картинок. Анимации — в globals.css (классы st-*)

type Sticker = { id: string; title: string; art: React.ReactNode };
export type Pack = { id: string; title: string; premium: boolean; cover: string; stickers: Sticker[] };

const S = (id: string, title: string, art: React.ReactNode): Sticker => ({ id, title, art });
const ink = "#141414";

// ============ Монохром: чёрно-белая эстетика ============
const mono: Sticker[] = [
  S("heart", "Сердце", <g className="st-pulse"><path d="M50 84 18 52a18 18 0 0 1 32-24 18 18 0 0 1 32 24z" fill="#fff" stroke={ink} strokeWidth="5" /><path d="M34 36a9 9 0 0 1 12 2" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" /></g>),
  S("chain", "Цепь", <g className="st-sway" fill="none" stroke={ink} strokeWidth="7"><rect x="16" y="38" width="38" height="24" rx="12" transform="rotate(-30 35 50)" /><rect x="46" y="38" width="38" height="24" rx="12" transform="rotate(-30 65 50)" stroke="#9a9a97" /></g>),
  S("diamond", "Бриллиант", <g className="st-shine"><path d="M20 38 34 20h32l14 18-30 44z" fill="#fff" stroke={ink} strokeWidth="4" strokeLinejoin="round" /><path d="M20 38h60M34 20l16 18 16-18M50 38v44" stroke={ink} strokeWidth="3" fill="none" /><path className="st-glint" d="M70 14l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill={ink} /></g>),
  S("sparkle", "Звёздочка", <g className="st-twinkle"><path d="M50 8c4 26 10 32 36 36-26 4-32 10-36 36-4-26-10-32-36-36 26-4 32-10 36-36z" fill={ink} /><path d="M80 66c1.5 8 3 9.5 11 11-8 1.5-9.5 3-11 11-1.5-8-3-9.5-11-11 8-1.5 9.5-3 11-11z" fill={ink} className="st-twinkle2" /></g>),
  S("butterfly", "Бабочка", <g className="st-flap"><g className="wing-l"><path d="M50 50C34 20 10 24 14 42s26 14 36 8z" fill={ink} /><path d="M50 52C30 56 20 76 32 80s18-14 18-28z" fill="#555" /></g><g className="wing-r"><path d="M50 50c16-30 40-26 36-8s-26 14-36 8z" fill={ink} /><path d="M50 52c20 4 30 24 18 28S50 66 50 52z" fill="#555" /></g><rect x="48" y="36" width="4" height="40" rx="2" fill={ink} /></g>),
  S("cherry", "Вишни", <g className="st-sway"><path d="M50 14c-6 18-18 34-22 46M50 14c4 18 14 30 22 44" stroke={ink} strokeWidth="4" fill="none" /><circle cx="28" cy="66" r="16" fill={ink} /><circle cx="72" cy="64" r="16" fill={ink} /><circle cx="22" cy="60" r="4" fill="#fff" /><circle cx="66" cy="58" r="4" fill="#fff" /></g>),
  S("bow", "Бантик", <g className="st-bounce"><path d="M50 50 16 30v40zM50 50l34-20v40z" fill="#fff" stroke={ink} strokeWidth="4" strokeLinejoin="round" /><path d="M46 54 36 86M54 54l10 32" stroke={ink} strokeWidth="5" strokeLinecap="round" /><circle cx="50" cy="50" r="8" fill={ink} /></g>),
  S("lock", "Замок-сердце", <g className="st-wiggle"><path d="M34 44V32a16 16 0 0 1 32 0v12" stroke={ink} strokeWidth="6" fill="none" /><path d="M50 90 22 62a16 16 0 0 1 28-20 16 16 0 0 1 28 20z" fill={ink} /><circle cx="50" cy="62" r="4" fill="#fff" /><rect x="48.5" y="62" width="3" height="10" fill="#fff" /></g>),
  S("wings", "Крылья", <g className="st-flap2"><path className="wing-l" d="M46 50C30 30 8 34 6 50c10-2 16 0 22 4-8 0-14 4-16 10 12-4 22-2 34-8z" fill="#fff" stroke={ink} strokeWidth="3" /><path className="wing-r" d="M54 50c16-20 38-16 40 0-10-2-16 0-22 4 8 0 14 4 16 10-12-4-22-2-34-8z" fill="#fff" stroke={ink} strokeWidth="3" /><circle cx="50" cy="52" r="6" fill={ink} /></g>),
  S("daisy", "Ромашка", <g className="st-spin-slow">{Array.from({ length: 10 }, (_, i) => <ellipse key={i} cx="50" cy="24" rx="9" ry="18" fill="#fff" stroke={ink} strokeWidth="3" transform={`rotate(${i * 36} 50 50)`} />)}<circle cx="50" cy="50" r="12" fill={ink} /></g>),
  S("eye", "Глаз", <g><path d="M8 50s16-26 42-26 42 26 42 26-16 26-42 26S8 50 8 50z" fill="#fff" stroke={ink} strokeWidth="5" /><g className="st-look"><circle cx="50" cy="50" r="14" fill={ink} /><circle cx="45" cy="45" r="4" fill="#fff" /></g><rect className="st-blink-lid" x="6" y="22" width="88" height="0" fill="#fff" /></g>),
  S("bolt", "Молния", <g className="st-flicker"><path d="M56 6 20 56h24l-6 38 40-52H54z" fill={ink} stroke={ink} strokeWidth="3" strokeLinejoin="round" /></g>),
];

// ============ Природа ============
const nature: Sticker[] = [
  S("sun", "Солнце", <g><g className="st-spin-slow">{Array.from({ length: 12 }, (_, i) => <rect key={i} x="48" y="4" width="4" height="16" rx="2" fill="#F5A623" transform={`rotate(${i * 30} 50 50)`} />)}</g><circle className="st-pulse" cx="50" cy="50" r="22" fill="#FFC93C" /><path d="M42 54q8 7 16 0" stroke="#8a5a00" strokeWidth="3" fill="none" strokeLinecap="round" /><circle cx="42" cy="46" r="2.5" fill="#8a5a00" /><circle cx="58" cy="46" r="2.5" fill="#8a5a00" /></g>),
  S("moon", "Луна", <g className="st-float"><path d="M64 14a36 36 0 1 0 22 52A30 30 0 0 1 64 14z" fill="#FFE08A" /><circle className="st-twinkle" cx="24" cy="22" r="3" fill="#7B61FF" /><circle className="st-twinkle2" cx="82" cy="30" r="2.5" fill="#7B61FF" /></g>),
  S("leaf", "Лист", <g className="st-sway"><path d="M20 80C20 40 50 16 86 14c0 38-26 66-66 66z" fill="#4CC38A" /><path d="M20 80 70 30" stroke="#1E7A55" strokeWidth="4" strokeLinecap="round" /></g>),
  S("flower", "Цветок", <g className="st-bounce">{Array.from({ length: 6 }, (_, i) => <circle key={i} cx="50" cy="28" r="14" fill="#FF8FB1" transform={`rotate(${i * 60} 50 46)`} />)}<circle cx="50" cy="46" r="11" fill="#FFC93C" /><path d="M50 60v32" stroke="#4CC38A" strokeWidth="5" /></g>),
  S("wave", "Волна", <g className="st-wave"><path d="M0 60q12-16 25 0t25 0 25 0 25 0v40H0z" fill="#3BA7F5" /><path d="M0 72q12-14 25 0t25 0 25 0 25 0v28H0z" fill="#1E6FD9" /><circle cx="78" cy="30" r="6" fill="#FFC93C" /></g>),
  S("mountain", "Горы", <g><path d="M6 86 38 30l20 30 12-18 24 44z" fill="#6C7A89" /><path d="M38 30 30 44l8-4 6 6z" fill="#fff" /><path className="st-float" d="M66 18c6 0 8-6 14-6s8 6 12 6" stroke="#9aa0a6" strokeWidth="4" fill="none" strokeLinecap="round" /></g>),
  S("rain", "Дождь", <g><g className="st-float"><circle cx="38" cy="38" r="16" fill="#C9D6E2" /><circle cx="58" cy="32" r="20" fill="#DCE5EE" /><rect x="22" y="38" width="56" height="16" rx="8" fill="#DCE5EE" /></g>{[30, 46, 62].map((x, i) => <path key={x} className="st-drop" style={{ animationDelay: `${i * 0.25}s` }} d={`M${x} 62l-4 12`} stroke="#3BA7F5" strokeWidth="4" strokeLinecap="round" />)}</g>),
  S("snow", "Снежинка", <g className="st-spin-slow" stroke="#5BC0F8" strokeWidth="5" strokeLinecap="round">{[0, 60, 120].map((r) => <g key={r} transform={`rotate(${r} 50 50)`}><path d="M50 12v76M50 24l-8-8M50 24l8-8M50 76l-8 8M50 76l8 8" /></g>)}</g>),
  S("tree", "Ёлка", <g className="st-sway"><path d="M50 8 22 46h12L18 70h64L66 46h12z" fill="#2E9E6A" /><rect x="44" y="70" width="12" height="16" fill="#8B5A2B" /><circle className="st-twinkle" cx="40" cy="52" r="3" fill="#FFC93C" /><circle className="st-twinkle2" cx="60" cy="40" r="3" fill="#FF6A3D" /></g>),
  S("mushroom", "Гриб", <g className="st-bounce"><path d="M14 50a36 30 0 0 1 72 0z" fill="#E5484D" /><circle cx="34" cy="38" r="5" fill="#fff" /><circle cx="56" cy="30" r="6" fill="#fff" /><circle cx="68" cy="44" r="4" fill="#fff" /><rect x="38" y="50" width="24" height="34" rx="10" fill="#F5E6D3" /></g>),
  S("fire", "Огонь", <g className="st-flame"><path d="M50 8c4 18 26 26 26 50a26 26 0 0 1-52 0c0-14 8-20 12-30 2 10 8 12 8 12 0-14 2-24 6-32z" fill="#FF6A3D" /><path d="M50 50c2 8 12 12 12 22a12 12 0 0 1-24 0c0-8 6-12 12-22z" fill="#FFC93C" /></g>),
  S("rainbow", "Радуга", <g className="st-pulse" fill="none" strokeWidth="7">{["#E5484D", "#FF6A3D", "#FFC93C", "#4CC38A", "#2F7BFF", "#7B61FF"].map((c, i) => <path key={c} d={`M${12 + i * 7} 74a${38 - i * 7} ${38 - i * 7} 0 0 1 ${76 - i * 14} 0`} stroke={c} />)}</g>),
];

// ============ Аниме-вайб ============
const face = (eyes: React.ReactNode, mouth: React.ReactNode, extra?: React.ReactNode, cls = "st-bounce") => (
  <g className={cls}><circle cx="50" cy="52" r="36" fill="#FFE1CC" />{extra}{eyes}{mouth}</g>
);
const anime: Sticker[] = [
  S("sparkle-eyes", "Сияющие глаза", face(<><path className="st-twinkle" d="M36 42l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#7B61FF" /><path className="st-twinkle2" d="M64 42l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#7B61FF" /></>, <path d="M42 70q8 6 16 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />)),
  S("sweat", "Капля пота", face(<><path d="M32 50q6-6 12 0M56 50q6-6 12 0" stroke={ink} strokeWidth="3" fill="none" /></>, <path d="M44 70h12" stroke={ink} strokeWidth="3" strokeLinecap="round" />, <path className="st-drop" d="M80 22q8 12 0 16-8-4 0-16z" fill="#5BC0F8" />)),
  S("anger", "Злюсь", face(<><path d="M32 46l12 4M68 46l-12 4" stroke={ink} strokeWidth="4" strokeLinecap="round" /><circle cx="38" cy="54" r="3" fill={ink} /><circle cx="62" cy="54" r="3" fill={ink} /></>, <path d="M42 72q8-6 16 0" stroke={ink} strokeWidth="3" fill="none" />, <path className="st-pulse" d="M72 16v8h8M88 24h-8v8M72 40v-8h-8M64 24h8v-8" stroke="#E5484D" strokeWidth="5" fill="none" strokeLinecap="round" />, "st-wiggle")),
  S("blush", "Смущение", face(<><path d="M32 52q6 4 12 0M56 52q6 4 12 0" stroke={ink} strokeWidth="3" fill="none" /></>, <circle cx="50" cy="70" r="3" fill={ink} />, <><ellipse className="st-pulse" cx="30" cy="62" rx="8" ry="4" fill="#FF8FB1" /><ellipse className="st-pulse" cx="70" cy="62" rx="8" ry="4" fill="#FF8FB1" /></>)),
  S("heart-eyes", "Влюблён", face(<><path className="st-pulse" d="M38 58 30 50a5 5 0 0 1 8-6 5 5 0 0 1 8 6z" fill="#E5484D" /><path className="st-pulse" d="M62 58l-8-8a5 5 0 0 1 8-6 5 5 0 0 1 8 6z" fill="#E5484D" /></>, <path d="M40 68q10 10 20 0z" fill={ink} />)),
  S("shuriken", "Сюрикен", <g className="st-spin"><path d="M50 6 58 42 94 50 58 58 50 94 42 58 6 50 42 42z" fill="#5a5f66" /><circle cx="50" cy="50" r="7" fill="#fff" /></g>),
  S("onigiri", "Онигири", <g className="st-bounce"><path d="M50 12 88 80H12z" fill="#fff" stroke={ink} strokeWidth="3" strokeLinejoin="round" /><rect x="34" y="58" width="32" height="22" fill={ink} /><circle cx="42" cy="46" r="3" fill={ink} /><circle cx="58" cy="46" r="3" fill={ink} /><path d="M46 52q4 3 8 0" stroke={ink} strokeWidth="2" fill="none" /></g>),
  S("sakura", "Сакура", <g>{[[30, 30, 0], [66, 44, 0.6], [44, 70, 1.2]].map(([x, y, d]) => <g key={x} transform={`translate(${x} ${y})`}><g className="st-fall" style={{ animationDelay: `${d}s` }}>{Array.from({ length: 5 }, (_, i) => <ellipse key={i} cx="0" cy="-9" rx="6" ry="9" fill="#FFB7CE" transform={`rotate(${i * 72})`} />)}<circle r="3" fill="#FF6A9A" /></g></g>)}</g>),
  S("exclaim", "!?", <g className="st-wiggle"><path d="M14 20h72a8 8 0 0 1 8 8v36a8 8 0 0 1-8 8H44l-16 16v-16H14a8 8 0 0 1-8-8V28a8 8 0 0 1 8-8z" fill="#fff" stroke={ink} strokeWidth="4" /><text x="50" y="60" textAnchor="middle" fontSize="34" fontWeight="900" fontFamily="Archivo, sans-serif" fill={ink}>!?</text></g>),
  S("neko", "Нэко", face(<><path d="M34 50q4-4 8 0M58 50q4-4 8 0" stroke={ink} strokeWidth="3" fill="none" /></>, <path d="M44 64q3 4 6 0 3 4 6 0" stroke={ink} strokeWidth="2.5" fill="none" />, <><path d="M18 34 22 8l20 18z" fill="#FFE1CC" className="st-ear" /><path d="M82 34 78 8 58 26z" fill="#FFE1CC" className="st-ear2" /><path d="M22 14l3 8 8 2M78 14l-3 8-8 2" stroke="#FF8FB1" strokeWidth="3" fill="none" /></>)),
  S("ghost", "Призрак", <g className="st-float"><path d="M20 90V44a30 30 0 0 1 60 0v46l-10-8-10 8-10-8-10 8-10-8z" fill="#fff" stroke={ink} strokeWidth="4" strokeLinejoin="round" /><circle cx="40" cy="46" r="5" fill={ink} /><circle cx="60" cy="46" r="5" fill={ink} /><ellipse cx="50" cy="62" rx="5" ry="7" fill={ink} /></g>),
  S("burst", "Бум!", <g className="st-pulse"><path d="M50 4l9 20 22-8-8 22 21 10-21 10 8 22-22-8-9 20-9-20-22 8 8-22-21-10 21-10-8-22 22 8z" fill="#FFC93C" stroke={ink} strokeWidth="3" strokeLinejoin="round" /><text x="50" y="58" textAnchor="middle" fontSize="22" fontWeight="900" fontFamily="Archivo, sans-serif" fill={ink}>БУМ</text></g>),
];

// ============ Работа ============
const work: Sticker[] = [
  S("rocket", "Ракета", <g className="st-launch"><path d="M50 8c16 12 20 34 14 56H36C30 42 34 20 50 8z" fill="#fff" stroke={ink} strokeWidth="4" /><circle cx="50" cy="34" r="8" fill="#2F7BFF" /><path d="M36 50 22 66l14-2M64 50l14 16-14-2" fill="#E5484D" /><path className="st-flame" d="M42 66q8 24 16 0z" fill="#FF6A3D" /></g>),
  S("coffee", "Кофе", <g><path d="M22 40h48v26a20 20 0 0 1-20 20h-8a20 20 0 0 1-20-20z" fill="#8B5A2B" /><path d="M70 46h6a10 10 0 0 1 0 20h-6" stroke="#8B5A2B" strokeWidth="6" fill="none" /><path className="st-steam" d="M36 30c-6-8 6-12 0-20M50 30c-6-8 6-12 0-20" stroke="#9aa0a6" strokeWidth="4" fill="none" strokeLinecap="round" /></g>),
  S("check", "Готово", <g className="st-pop"><circle cx="50" cy="50" r="40" fill="#23a55a" /><path className="st-draw" d="M30 52l14 14 28-30" stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>),
  S("money", "Деньги", <g className="st-float">{[0, 1, 2].map((i) => <g key={i} transform={`translate(${i * 6} ${i * -8}) rotate(${-8 + i * 6} 50 50)`}><rect x="16" y="34" width="64" height="36" rx="5" fill={i === 2 ? "#4CC38A" : "#2E9E6A"} stroke="#1E7A55" strokeWidth="2" /><circle cx="48" cy="52" r="10" fill="#1E7A55" /><text x="48" y="57" textAnchor="middle" fontSize="13" fontWeight="900" fill="#4CC38A">₽</text></g>)}</g>),
  S("chart", "Рост", <g><rect x="12" y="12" width="76" height="76" rx="14" fill="#fff" stroke={ink} strokeWidth="3" /><path className="st-draw" d="M22 72l18-18 12 10 26-30" stroke="#23a55a" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M66 34h12v12" stroke="#23a55a" strokeWidth="6" fill="none" strokeLinecap="round" /></g>),
  S("hundred", "100", <g className="st-wiggle"><text x="50" y="60" textAnchor="middle" fontSize="44" fontWeight="900" fontStyle="italic" fontFamily="Archivo, sans-serif" fill="#E5484D">100</text><path d="M16 70h68M20 78h60" stroke="#E5484D" strokeWidth="5" strokeLinecap="round" /></g>),
  S("laptop", "Ноутбук", <g><rect x="18" y="22" width="64" height="42" rx="5" fill={ink} /><rect x="23" y="27" width="54" height="32" rx="2" fill="#2F7BFF" className="st-screen" /><path d="M8 70h84l-6 10H14z" fill="#9aa0a6" /><path className="st-blink" d="M30 36h16M30 44h28M30 52h10" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></g>),
  S("clock", "Дедлайн", <g className="st-wiggle"><circle cx="50" cy="52" r="34" fill="#fff" stroke={ink} strokeWidth="5" /><g className="st-spin"><circle cx="50" cy="52" r="24" fill="none" /><path d="M50 52V30" stroke="#E5484D" strokeWidth="4" strokeLinecap="round" /></g><path d="M50 52h14" stroke={ink} strokeWidth="4" strokeLinecap="round" /><path d="M26 18l-10 10M74 18l10 10" stroke={ink} strokeWidth="6" strokeLinecap="round" /></g>),
  S("target", "В цель", <g><circle cx="50" cy="50" r="36" fill="#E5484D" /><circle cx="50" cy="50" r="24" fill="#fff" /><circle cx="50" cy="50" r="12" fill="#E5484D" /><g className="st-hit"><path d="M50 50 86 14" stroke={ink} strokeWidth="4" /><path d="M86 14l-10 2 8 8z" fill={ink} /></g></g>),
  S("trophy", "Кубок", <g className="st-bounce"><path d="M30 14h40v20a20 20 0 0 1-40 0z" fill="#FFC93C" /><path d="M30 20H18a12 12 0 0 0 12 16M70 20h12a12 12 0 0 1-12 16" stroke="#F5A623" strokeWidth="5" fill="none" /><rect x="44" y="52" width="12" height="16" fill="#F5A623" /><rect x="30" y="68" width="40" height="12" rx="3" fill={ink} /><path className="st-glint" d="M40 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff" /></g>),
  S("bulb", "Идея", <g><g className="st-rays" stroke="#FFC93C" strokeWidth="4" strokeLinecap="round"><path d="M50 4v8M18 18l6 6M82 18l-6 6M8 48h8M84 48h8" /></g><path className="st-glow" d="M50 18a26 26 0 0 0-14 48v10h28V66a26 26 0 0 0-14-48z" fill="#FFE08A" stroke={ink} strokeWidth="3" /><rect x="38" y="78" width="24" height="8" rx="3" fill="#9aa0a6" /></g>),
  S("deal", "Сделка", <g className="st-shake"><path d="M8 46l18-14 16 8 10-6 14 8 26-10v24L66 70 42 78 22 64 8 64z" fill="#FFE1CC" stroke={ink} strokeWidth="3" strokeLinejoin="round" /><path d="M42 52l10 10M52 46l10 10M62 44l8 8" stroke={ink} strokeWidth="3" strokeLinecap="round" /></g>),
];

// ============ Неон-слова ============
const neonWord = (id: string, word: string, color: string, size = 30) =>
  S(id, word, <g className="st-neon" style={{ "--n": color } as React.CSSProperties}>
    <rect x="6" y="26" width="88" height="48" rx="14" fill="#141414" />
    <text x="50" y={56 + (30 - size) / 4} textAnchor="middle" fontSize={size} fontWeight="900" fontFamily="Archivo, sans-serif" fill="#fff" stroke={color} strokeWidth="1.5" style={{ filter: `drop-shadow(0 0 4px ${color})` }}>{word}</text>
  </g>);
const neon: Sticker[] = [
  neonWord("love", "LOVE", "#FF4F8B"), neonWord("wow", "WOW", "#FFC93C"), neonWord("gg", "GG", "#4CC38A", 36), neonWord("ok", "OK", "#2F7BFF", 36),
  neonWord("no", "НЕТ", "#E5484D"), neonWord("yes", "ДА", "#23a55a", 36), neonWord("fire", "ОГОНЬ", "#FF6A3D", 22), neonWord("aura", "AURA", "#7B61FF"),
  neonWord("callme", "CALL ME", "#5BC0F8", 18), neonWord("newpost", "NEW POST", "#FF8FB1", 16), neonWord("lol", "LOL", "#FFE08A"), neonWord("work", "WORK", "#9aa0a6", 24),
];

export const PACKS: Pack[] = [
  { id: "nature", title: "Природа", premium: false, cover: "sun", stickers: nature },
  { id: "work", title: "Работа", premium: false, cover: "rocket", stickers: work },
  { id: "mono", title: "Монохром", premium: true, cover: "butterfly", stickers: mono },
  { id: "anime", title: "Аниме-вайб", premium: true, cover: "sparkle-eyes", stickers: anime },
  { id: "neon", title: "Неон", premium: true, cover: "aura", stickers: neon },
];

export function findSticker(code: string) {
  const [packId, id] = code.split(":");
  const pack = PACKS.find((p) => p.id === packId);
  return { pack, sticker: pack?.stickers.find((s) => s.id === id) };
}

export function StickerArt({ code, size = 120 }: { code: string; size?: number }) {
  const { sticker } = findSticker(code);
  if (!sticker) return <span className="sticker-missing">стикер</span>;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="sticker" role="img" aria-label={sticker.title}>
      {sticker.art}
    </svg>
  );
}
