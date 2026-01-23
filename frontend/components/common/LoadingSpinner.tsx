import { Loader2 } from 'lucide-react';

interface Props {
  size?: number;
  className?: string;
  text?: string;
}

export default function LoadingSpinner({ size = 24, className = '', text }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <Loader2 size={size} className="animate-spin text-blue-600" />
      {text && (
        <p className="mt-3 text-sm text-gray-600">{text}</p>
      )}
    </div>
  );
}
