import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout.js';
import { useCurrentCreator } from './lib/current-creator.js';
import { CampaignDetailPage } from './pages/campaign-detail.js';
import { CreatorPickerPage } from './pages/creator-picker.js';
import { MatchesPage } from './pages/matches.js';
import { MyBidsPage } from './pages/my-bids.js';

/**
 * Anything past the picker needs to know who the visitor is acting as, so it
 * sends them back rather than rendering an empty shell.
 */
function RequireCreator({ children }: { children: React.ReactNode }) {
  const { creatorId } = useCurrentCreator();
  return creatorId ? <>{children}</> : <Navigate to="/creators" replace />;
}

export function App() {
  const { creatorId } = useCurrentCreator();

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to={creatorId ? '/matches' : '/creators'} replace />} />
        <Route path="/creators" element={<CreatorPickerPage />} />
        <Route
          path="/matches"
          element={
            <RequireCreator>
              <MatchesPage />
            </RequireCreator>
          }
        />
        <Route
          path="/campaigns/:campaignId"
          element={
            <RequireCreator>
              <CampaignDetailPage />
            </RequireCreator>
          }
        />
        <Route
          path="/bids"
          element={
            <RequireCreator>
              <MyBidsPage />
            </RequireCreator>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
