export function WaterReflection() {
  return <svg className="water-reflection" viewBox="0 0 400 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="1.5">
      {Array.from({ length: 18 }, (_, i) => <path key={i} d={`M-120 ${i * 38} C30 ${i * 38 - 65} 150 ${i * 38 + 70} 270 ${i * 38} S440 ${i * 38 - 30} 540 ${i * 38 + 15}`} />)}
    </g>
  </svg>;
}