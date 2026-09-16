import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout.js';
import { useCurrentCreator } from './lib/current-creator.js';
import { useCreators } from './lib/queries.js';
import { CampaignDetailPage } from './pages/campaign-detail.js';
import { CreatorPickerPage } from './pages/creator-picker.js';
import { MatchesPage } from './pages/matches.js';
import { MyBidsPage } from './pages/my-bids.js';

/**
 * Anything past the picker needs to know who the visitor is acting as, so it
 * sends them back rather than rendering an empty shell.
 */
function RequireCreator({ children }: { children: React.ReactNode }) {
  const { creatorId, setCreatorId } = useCurrentCreator();
  const { data, isSuccess } = useCreators();

  // A remembered creator can stop existing - the demo data is reseeded, or the
  // id was stored against a different environment. Checking that the id still
  // resolves matters because the header hides its navigation when it cannot
  // work out who you are, so an unrecognised id would otherwise strand the page
  // on "Creator not found" with no way back to the picker.
  const isKnown = data?.creators.some((creator) => creator.id === creatorId) ?? false;
  const isStale = isSuccess && !isKnown;

  useEffect(() => {
    if (creatorId && isStale) setCreatorId(null);
  }, [creatorId, isStale, setCreatorId]);

  if (!creatorId || isStale) return <Navigate to="/creators" replace />;

  return <>{children}</>;
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
