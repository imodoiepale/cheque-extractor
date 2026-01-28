'use client';

interface Props {
  stage: string;
  progress: number;
  isComplete: boolean;
}

export default function StageIndicator({ stage, progress, isComplete }: Props) {
  if (isComplete) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="text-center">
          <div className="text-4xl mb-2">✓</div>
          <h3 className="text-lg font-semibold text-green-900">Processing Complete!</h3>
          <p className="text-green-700 mt-1">Your check has been successfully processed</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-blue-900 capitalize">
            {stage.replace(/_/g, ' ')}
          </h3>
          <p className="text-blue-700 text-sm">Processing your check...</p>
        </div>
        <div className="text-2xl font-bold text-blue-600">{progress}%</div>
      </div>
      
      <div className="w-full bg-blue-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}