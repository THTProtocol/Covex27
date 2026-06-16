// A stylized, honest Kaspa BlockDAG: blocks are produced in parallel ("columns" = time),
// every block references multiple parents, and GHOSTDAG picks one selected-parent chain
// (the brighter, flowing path). Decorative + reduced-motion-safe + dual-mode.
// Shared between the /kaspa explainer and the Explorer hero motif.
export default function BlockDagViz() {
  const X = [55, 150, 245, 340, 435, 530];
  const COLS = [[110], [70, 150], [50, 110, 170], [70, 150], [50, 110, 170], [110]];
  const SEL = [0, 0, 1, 0, 1, 0]; // selected-parent index in each column
  const nodes = [];
  COLS.forEach((ys, c) => ys.forEach((y, i) => nodes.push({ x: X[c], y, selected: SEL[c] === i })));
  const edges = [];
  for (let c = 1; c < COLS.length; c++) {
    COLS[c].forEach((y, i) => {
      COLS[c - 1].forEach((py, pi) => {
        edges.push({ x1: X[c - 1], y1: py, x2: X[c], y2: y, onChain: SEL[c] === i && SEL[c - 1] === pi });
      });
    });
  }
  return (
    <svg viewBox="0 0 585 220" className="w-full h-auto" role="img"
      aria-label="A Kaspa BlockDAG: blocks produced in parallel, ordered by the GHOSTDAG selected-parent chain">
      <g stroke="#49EACB" fill="none">
        {edges.map((e, k) => (
          <line key={k} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            strokeWidth={e.onChain ? 2 : 1} strokeOpacity={e.onChain ? 0.75 : 0.16}
            className={e.onChain ? 'dag-edge-flow' : ''} />
        ))}
      </g>
      {nodes.map((n, k) => (
        <g key={k} className={n.selected ? 'dag-node-pulse' : ''}>
          <rect x={n.x - 15} y={n.y - 11} width="30" height="22" rx="6"
            fill={n.selected ? 'rgba(73,234,203,0.16)' : 'rgba(73,234,203,0.05)'}
            stroke="#49EACB" strokeOpacity={n.selected ? 0.95 : 0.4} strokeWidth={n.selected ? 1.6 : 1} />
        </g>
      ))}
    </svg>
  );
}
