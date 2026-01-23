import { formatConfidence } from '@/lib/utils/formatting';

interface Props {
  confidence: number;
  source: 'ocr' | 'ai' | 'hybrid' | 'manual';
}

export default function ConfidenceBadge({ confidence, source }: Props) {
  const getColor = () => {
    if (source === 'manual') return 'bg-purple-100 text-purple-800';
    if (confidence >= 0.9) return 'bg-green-100 text-green-800';
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${getColor()}`}>
      <span>{formatConfidence(confidence)}</span>
      <span className="uppercase text-[10px]">{source}</span>
    </div>
  );
}