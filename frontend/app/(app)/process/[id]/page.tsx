'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCheckProcessing } from '@/lib/hooks/useCheckProcessing';
import ProcessTimeline from './components/ProcessTimeline';
import StageIndicator from './components/StageIndicator';
import ExtractionComparison from './components/ExtractionComparison';
import { useEffect } from 'react';

export default function ProcessingPage() {
  const params = useParams();
  const router = useRouter();
  const checkId = params.id as string;

  const { stages, currentStage, progress, isComplete, error } = useCheckProcessing(checkId);

  useEffect(() => {
    if (isComplete) {
      // Redirect to review page after 2 seconds
      setTimeout(() => {
        router.push(`/review/${checkId}`);
      }, 2000);
    }
  }, [isComplete, checkId, router]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Processing Check</h1>
        <p className="text-gray-600 mt-2">Real-time processing pipeline visualization</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <p className="font-medium">Processing Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      <ProcessTimeline stages={stages} currentStage={currentStage} />

      <StageIndicator 
        stage={currentStage} 
        progress={progress}
        isComplete={isComplete}
      />

      {currentStage === 'hybrid_selection' && (
        <ExtractionComparison checkId={checkId} />
      )}

      {isComplete && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          <p className="font-medium">✓ Processing Complete!</p>
          <p className="text-sm mt-1">Redirecting to review page...</p>
        </div>
      )}
    </div>
  );
}