import { STATUS_LABELS, getStatusColor } from '@/lib/utils/formatting';

interface Props {
  status: string;
}

export default function StatusBadge({ status }: Props) {
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}