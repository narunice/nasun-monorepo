/**
 * PredictionAdminPanel
 * Panel content for prediction market admin within unified AdminPage
 */

import { useNavigate } from 'react-router-dom';
import { CreateMarketForm } from './CreateMarketForm';

export function PredictionAdminPanel() {
  const navigate = useNavigate();

  const handleSuccess = (digest: string) => {
    console.log('Market created:', digest);
    // Navigate to markets list after short delay
    setTimeout(() => {
      navigate('/predict');
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Create Market Form */}
      <CreateMarketForm
        onSuccess={handleSuccess}
        onCancel={() => navigate('/predict')}
      />

      {/* Help Text */}
      <div className="bg-theme-bg-secondary rounded-xl p-4">
        <h3 className="text-sm font-semibold text-theme-text-primary mb-2">
          Market Creation Tips
        </h3>
        <ul className="text-sm text-theme-text-muted space-y-1">
          <li>- Frame questions as clear yes/no with specific dates</li>
          <li>- Include detailed resolution criteria in the description</li>
          <li>- Set close time before the event outcome is known</li>
          <li>- Allow adequate time between close and resolve deadline</li>
          <li>- Choose the appropriate category for discoverability</li>
        </ul>
      </div>
    </div>
  );
}
