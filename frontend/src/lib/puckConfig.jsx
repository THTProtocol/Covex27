/**
 * Puck component catalog for covenant pages. Creators compose pages ONLY from
 * these platform-authored blocks: props are plain JSON, no user HTML or JS
 * ever reaches the DOM, so published pages are phishing/XSS safe by design.
 * The mandatory transparency panel lives outside Puck and cannot be removed.
 */

const align = (a) => (a === 'center' ? 'text-center mx-auto' : a === 'right' ? 'text-right ml-auto' : 'text-left');

export const puckConfig = {
  categories: {
    layout: { title: 'Layout', components: ['Hero', 'Spacer', 'Divider', 'TwoColumns'] },
    content: { title: 'Content', components: ['Heading', 'Paragraph', 'BulletList', 'FAQItem', 'ImageBlock'] },
    covenant: { title: 'Covenant', components: ['StakeCTA', 'StatRow', 'FeeNotice'] },
  },
  components: {
    Hero: {
      label: 'Hero Banner',
      fields: {
        title: { type: 'text' },
        subtitle: { type: 'textarea' },
        alignment: { type: 'radio', options: [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }] },
        accent: { type: 'text', label: 'Accent hex (optional)' },
      },
      defaultProps: { title: 'My Covenant', subtitle: 'Stake, play, and settle on the Kaspa BlockDAG.', alignment: 'center', accent: '' },
      render: ({ title, subtitle, alignment, accent }) => (
        <div className={`py-10 px-4 ${align(alignment)}`}>
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3" style={accent ? { color: accent } : {}}>{title}</h1>
          {subtitle && <p className="text-gray-300 max-w-xl text-base leading-relaxed mx-auto">{subtitle}</p>}
        </div>
      ),
    },
    Heading: {
      fields: { text: { type: 'text' }, size: { type: 'select', options: [{ label: 'Large', value: 'lg' }, { label: 'Medium', value: 'md' }] } },
      defaultProps: { text: 'Section title', size: 'md' },
      render: ({ text, size }) => (
        <h2 className={`font-bold text-white px-4 mt-6 mb-2 ${size === 'lg' ? 'text-2xl' : 'text-xl'}`}>{text}</h2>
      ),
    },
    Paragraph: {
      fields: { text: { type: 'textarea' } },
      defaultProps: { text: 'Describe how your covenant works, who can join, and how it resolves.' },
      render: ({ text }) => <p className="text-sm text-gray-300 leading-relaxed px-4 mb-3 whitespace-pre-wrap">{text}</p>,
    },
    BulletList: {
      fields: { items: { type: 'array', arrayFields: { text: { type: 'text' } }, defaultItemProps: { text: 'A rule of this covenant' } } },
      defaultProps: { items: [{ text: 'Players stake equal amounts' }, { text: 'Winner takes the pot minus fees' }] },
      render: ({ items }) => (
        <ul className="px-8 mb-3 space-y-1.5">
          {(items || []).map((i, idx) => (
            <li key={idx} className="text-sm text-gray-300 list-disc">{i.text}</li>
          ))}
        </ul>
      ),
    },
    FAQItem: {
      fields: { question: { type: 'text' }, answer: { type: 'textarea' } },
      defaultProps: { question: 'How do payouts work?', answer: 'The oracle signs the outcome and the covenant script releases the pot accordingly.' },
      render: ({ question, answer }) => (
        <div className="mx-4 mb-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-sm font-bold text-white mb-1">{question}</p>
          <p className="text-xs text-gray-400 leading-relaxed">{answer}</p>
        </div>
      ),
    },
    ImageBlock: {
      fields: { url: { type: 'text', label: 'Image URL (https)' }, caption: { type: 'text' }, rounded: { type: 'radio', options: [{ label: 'Rounded', value: 'yes' }, { label: 'Square', value: 'no' }] } },
      defaultProps: { url: '', caption: '', rounded: 'yes' },
      render: ({ url, caption, rounded }) => {
        const safe = typeof url === 'string' && (url.startsWith('https://') || url.startsWith('data:image/'));
        if (!safe) return <div className="mx-4 mb-3 h-32 rounded-xl border border-dashed border-white/15 flex items-center justify-center text-xs text-gray-500">Add an https image URL</div>;
        return (
          <figure className="mx-4 mb-3">
            <img src={url} alt={caption || 'covenant image'} className={`w-full max-h-96 object-cover border border-white/10 ${rounded === 'yes' ? 'rounded-2xl' : ''}`} />
            {caption && <figcaption className="text-[11px] text-gray-500 mt-1 text-center">{caption}</figcaption>}
          </figure>
        );
      },
    },
    StatRow: {
      label: 'Stats Row',
      fields: { stats: { type: 'array', arrayFields: { label: { type: 'text' }, value: { type: 'text' } }, defaultItemProps: { label: 'Stat', value: '0' } } },
      defaultProps: { stats: [{ label: 'Min stake', value: '1 KAS' }, { label: 'Fee', value: '2%' }, { label: 'Players', value: '2' }] },
      render: ({ stats }) => (
        <div className="grid grid-cols-3 gap-3 px-4 mb-4">
          {(stats || []).slice(0, 6).map((s, i) => (
            <div key={i} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-gray-500">{s.label}</p>
              <p className="text-lg font-bold text-white">{s.value}</p>
            </div>
          ))}
        </div>
      ),
    },
    StakeCTA: {
      label: 'Stake Button',
      fields: { label: { type: 'text' }, helper: { type: 'text' } },
      defaultProps: { label: 'Stake and join', helper: 'Opens the interact panel. Non-custodial, signs in your wallet.' },
      render: ({ label, helper }) => (
        <div className="px-4 mb-4 text-center">
          <a href="#interact" className="inline-block px-8 py-4 rounded-2xl bg-kaspa-green text-black font-extrabold text-lg hover:brightness-110 transition-all">
            {label}
          </a>
          {helper && <p className="text-[11px] text-gray-500 mt-2">{helper}</p>}
        </div>
      ),
    },
    FeeNotice: {
      label: 'Fee Transparency',
      fields: { feeText: { type: 'textarea', label: 'Fee breakdown text' } },
      defaultProps: { feeText: 'Winner receives 96% of the pot. Creator earns 2%. 2% returns to the covenant for the next round.' },
      render: ({ feeText }) => (
        <div className="mx-4 mb-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
          <p className="text-[10px] uppercase tracking-widest text-amber-300 mb-1 font-bold">Fees, in plain words</p>
          <p className="text-xs text-amber-100/80 leading-relaxed">{feeText}</p>
        </div>
      ),
    },
    TwoColumns: {
      fields: { left: { type: 'textarea' }, right: { type: 'textarea' } },
      defaultProps: { left: 'Left column text', right: 'Right column text' },
      render: ({ left, right }) => (
        <div className="grid sm:grid-cols-2 gap-4 px-4 mb-4">
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{left}</p>
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{right}</p>
        </div>
      ),
    },
    Spacer: {
      fields: { size: { type: 'select', options: [{ label: 'Small', value: 'sm' }, { label: 'Medium', value: 'md' }, { label: 'Large', value: 'lg' }] } },
      defaultProps: { size: 'md' },
      render: ({ size }) => <div className={size === 'lg' ? 'h-16' : size === 'sm' ? 'h-4' : 'h-8'} />,
    },
    Divider: {
      fields: {},
      defaultProps: {},
      render: () => <hr className="border-white/[0.08] mx-4 my-4" />,
    },
  },
};

export default puckConfig;
