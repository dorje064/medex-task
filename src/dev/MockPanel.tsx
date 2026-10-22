import { useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import {
  ENDPOINTS,
  getMockSettings,
  MOCK_MODES,
  setMockMode,
  subscribeMockSettings,
  type MockMode,
} from '../mocks/controller';

const MODE_LABELS: Record<MockMode, string> = {
  ok: 'Normal',
  slow: 'Slow (6 s)',
  error: 'Server error (500)',
  network: 'Network failure',
};

/** Reviewer tool: make the mock API slow or fail on demand, then reload data. */
export function MockPanel() {
  const settings = useSyncExternalStore(subscribeMockSettings, getMockSettings);
  const queryClient = useQueryClient();
  return (
    <details className="mock-panel">
      <summary>Mock API controls</summary>
      <p className="mock-note">Changes apply to the next request. Use “Reload data” or “Try again” to send one.</p>
      {ENDPOINTS.map((endpoint) => (
        <label key={endpoint} className="mock-row">
          <span>{endpoint}</span>
          <select
            className="select"
            value={settings.modes[endpoint]}
            onChange={(event) => setMockMode(endpoint, event.target.value as MockMode)}
          >
            {MOCK_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
      ))}
      <div className="mock-actions">
        <button type="button" className="button button-secondary" onClick={() => void queryClient.refetchQueries()}>
          Reload data
        </button>
        <button type="button" className="button button-secondary" onClick={() => queryClient.resetQueries()}>
          Reload from scratch
        </button>
      </div>
    </details>
  );
}
