import { formatConfidence } from '@/lib/utils/formatting';
import { Badge } from '@/components/ui';

interface Props {
  confidence: number;
  source: 'ocr' | 'ai' | 'hybrid' | 'manual';
}

/**
 * Confidence as a Badge tone. A manual edit is not a confidence score, so it
 * reads `brand` (an action), never green/amber/red (a measurement).
 */
function tone(confidence: number, source: Props['source']) {
  if (source === 'manual') return 'brand' as const;
  if (confidence >= 0.9) return 'success' as const;
  if (confidence >= 0.7) return 'warning' as const;
  return 'error' as const;
}

export default function ConfidenceBadge({ confidence, source }: Props) {
  return (
    <Badge tone={tone(confidence, source)} size="md">
      <span className="nums">{formatConfidence(confidence)}</span>
      <span className="text-[10px] uppercase tracking-eyebrow">{source}</span>
    </Badge>
  );
}
