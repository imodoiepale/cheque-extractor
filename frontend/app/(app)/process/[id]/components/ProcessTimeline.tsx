'use client';

import { ProcessingStage } from '@/types/check';
import { PROCESSING_STAGES } from '@/lib/utils/constants';
import { Clock, Loader2, CheckCircle } from 'lucide-react';

interface Props {
  stages: ProcessingStage[];
  currentStage: string;
}

export default function ProcessTimeline({ stages, currentStage }: Props) {
  const getStageStatus = (stageName: string) => {
    const stage = stages.find(s => s.stage_name === stageName);
    return stage?.status || 'pending';
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-6">Processing Pipeline</h2>
      
      <div className="space-y-4">
        {PROCESSING_STAGES.map((stage, index) => {
          const status = getStageStatus(stage.name);
          const isCurrent = currentStage === stage.name;
          
          return (
            <div key={stage.name} className="flex items-center gap-4">
              {/* Icon */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                status === 'complete' ? 'bg-green-100' :
                isCurrent ? 'bg-blue-100' :
                'bg-gray-100'
              }`}>
                {status === 'complete' ? (
                  <CheckCircle className="text-green-600" size={20} />
                ) : isCurrent ? (
                  <Loader2 className="text-blue-600 animate-spin" size={20} />
                ) : (
                  <Clock className="text-gray-400" size={20} />
                )}
              </div>

              {/* Content */}
              <div className="flex-1">
                <p className={`font-medium ${
                  isCurrent ? 'text-blue-600' : 'text-gray-900'
                }`}>
                  {stage.label}
                </p>
                <p className="text-sm text-gray-500">
                  {status === 'complete' ? 'Complete' :
                   isCurrent ? 'In Progress' :
                   'Pending'}
                </p>
              </div>

              {/* Connector */}
              {index < PROCESSING_STAGES.length - 1 && (
                <div className={`absolute left-5 w-0.5 h-8 mt-12 ${
                  status === 'complete' ? 'bg-green-200' : 'bg-gray-200'
                }`} style={{ marginLeft: '20px' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}